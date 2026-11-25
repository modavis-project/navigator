import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/requestCache.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const settings = { maxEntries: 2, maxBytes: 200, maxPending: 2, ttlMs: 100, timeoutMs: 1000 };
function setup(fetch, overrides = {}) {
  let now = 0;
  const context = { exports: {}, fetch, AbortController, DOMException, setTimeout, clearTimeout, Date: { now: () => now } };
  vm.runInNewContext(compiled, context);
  return { cache: new context.exports.JsonRequestCache({ ...settings, ...overrides }), tick: milliseconds => { now += milliseconds; } };
}
const response = value => ({ ok: true, status: 200, text: async () => JSON.stringify(value) });

test("GET reuse expires and evicts the least recently used completed response", async () => {
  const calls = [];
  const { cache, tick } = setup(async url => { calls.push(url); return response(url); });
  await cache.get("/a"); await cache.get("/b"); await cache.get("/a"); await cache.get("/c"); await cache.get("/b");
  assert.deepEqual(calls, ["/a", "/b", "/c", "/b"]);
  tick(101);
  await cache.get("/b");
  assert.equal(calls.length, 5);
});

test("oversized data does not remain cached", async () => {
  let calls = 0;
  const { cache } = setup(async () => { calls += 1; return response("x".repeat(200)); });
  await cache.get("/large"); await cache.get("/large");
  assert.equal(calls, 2);
});

test("cancelling one shared reader does not cancel another", async () => {
  let finish, networkSignal, calls = 0;
  const { cache } = setup((_url, { signal }) => { calls += 1; networkSignal = signal; return new Promise(resolve => { finish = resolve; }); });
  const first = new AbortController(); const second = new AbortController();
  const firstRead = cache.get("/shared", { signal: first.signal });
  const secondRead = cache.get("/shared", { signal: second.signal });
  first.abort();
  await assert.rejects(firstRead, { name: "AbortError" });
  assert.equal(networkSignal.aborted, false);
  finish(response("still needed"));
  assert.equal(await secondRead, "still needed");
  assert.equal(calls, 1);
});

test("the last reader cancels network work and a new reader gets a fresh request", async () => {
  let calls = 0;
  const signals = [];
  const { cache } = setup((_url, { signal }) => {
    signals.push(signal); calls += 1;
    if (calls > 1) return Promise.resolve(response("fresh"));
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  });
  const controller = new AbortController();
  const read = cache.get("/cancel", { signal: controller.signal }); controller.abort();
  await assert.rejects(read, { name: "AbortError" });
  assert.equal(signals[0].aborted, true);
  assert.equal(await cache.get("/cancel"), "fresh");
  assert.equal(calls, 2);
});

test("no-store, reload and private reads cannot reuse public cache entries", async () => {
  let calls = 0;
  const { cache } = setup(async () => response(++calls));
  await cache.get("/api/release-context", { cache: "no-store" });
  await cache.get("/api/release-context", { cache: "no-store" });
  await cache.get("/api/admin/summary"); await cache.get("/api/admin/summary");
  await cache.get("/api/organs", { headers: { "X-Navigator-Actor-Id": "test" } });
  await cache.get("/api/organs", { headers: { "X-Navigator-Actor-Id": "test" } });
  await cache.get("/api/organs", { cache: "reload" }); await cache.get("/api/organs", { cache: "reload" });
  assert.equal(calls, 8);
});

test("mutation invalidation prevents an older in-flight read from repopulating the cache", async () => {
  let finish, calls = 0;
  const { cache } = setup(async () => { calls += 1; return calls === 1 ? new Promise(resolve => { finish = resolve; }) : response("after change"); });
  const old = cache.get("/record"); cache.clear(); finish(response("old")); await old;
  assert.equal(await cache.get("/record"), "after change");
  assert.equal(calls, 2);
});

test("reads are scoped to the discovered POD and follow server cache policy", async () => {
  const route = "/api/temperaments";
  const snapshotHeader = "X-MODAVIS-POD-Snapshot";
  const seen = [];
  const { cache, tick } = setup(async (_url, { headers }) => {
    const scope = headers[snapshotHeader];
    seen.push(scope);
    return { ...response(seen.length), headers: { get: () => scope === "old" ? "private, max-age=86400, immutable" : "private, no-cache" } };
  });
  cache.setPublicSnapshot("old");
  assert.equal(await cache.get(route), 1);
  tick(10_000);
  assert.equal(await cache.get(route), 1);
  cache.setPublicSnapshot("new");
  assert.equal(await cache.get(route), 2);
  assert.equal(await cache.get(route), 3);
  assert.equal(await cache.get(route, { headers: { Authorization: "Bearer example" } }), 4);
  assert.deepEqual(seen, ["old", "new", "new", undefined]);
});

test("service failures are retryable and do not reveal server details", async () => {
  let calls = 0;
  const { cache } = setup(async () => ++calls === 1 ? { ok: false, status: 503, text: async () => "private stack" } : response("ready"));
  await assert.rejects(cache.get("/retry"), /narrower search/);
  assert.equal(await cache.get("/retry"), "ready");
});

test("already cancelled callers do not receive cached results or start network work", async () => {
  let calls = 0;
  const { cache } = setup(async () => response(++calls));
  await cache.get("/a");
  const controller = new AbortController(); controller.abort();
  await assert.rejects(cache.get("/a", { signal: controller.signal }), { name: "AbortError" });
  await assert.rejects(cache.get("/b", { signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 1);
});

test("a request that exceeds its budget is aborted and can be retried", async () => {
  let calls = 0;
  const { cache } = setup((_url, { signal }) => ++calls === 1
    ? new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }))
    : Promise.resolve(response("ready")), { timeoutMs: 5 });
  await assert.rejects(cache.get("/slow"), /took too long/);
  assert.equal(await cache.get("/slow"), "ready");
});

test("invalid responses have a safe explanation and never become cached data", async () => {
  let calls = 0;
  const { cache } = setup(async () => ++calls === 1 ? { ok: true, text: async () => "<html>server diagnostic</html>" } : response("valid"));
  await assert.rejects(cache.get("/invalid"), /unreadable response/);
  assert.equal(await cache.get("/invalid"), "valid");
});

test("public query and snapshot refusals explain the repair without exposing private or server diagnostics", async () => {
  const cases = [
    ["/api/workbench/selection?where=x", 400, "where operand must be an array", "where operand must be an array"],
    ["/api/workbench/compare?snapshot=old", 409, "snapshot does not match the current dataset", "snapshot does not match the current dataset"],
    ["/api/pod/collection?limit=bad", 400, "limit must be an integer", "limit must be an integer"],
    ["/api/vocab/registry?snapshot=old", 409, "Requested terminology seed snapshot is unavailable", "Requested terminology seed snapshot is unavailable"],
    ["/api/omaro/concepts?limit=bad", 400, "Invalid page bounds", "Invalid page bounds"],
    ["/api/vocab/references/network", 400, "SELECT private FROM internal", "Could not load the data (400). Please try again."],
    ["/api/admin/operations", 400, "private operator detail", "Could not load the data (400). Please try again."],
    ["/api/workbench/selection", 503, "SELECT private FROM internal", "The data service could not finish this request. Try a narrower search or try again."],
    ["/api/workbench/selection", 400, "Traceback /Users/operator/private.py", "Could not load the data (400). Please try again."],
  ];
  for (const [url, status, error, expected] of cases) {
    const { cache } = setup(async () => ({ ok: false, status, text: async () => JSON.stringify({ error }) }));
    await assert.rejects(cache.get(url), value => value.message === expected && value.status === status);
  }
});
