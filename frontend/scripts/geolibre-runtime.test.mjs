import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { geoLibreMiddleware, resolveGeoLibreFile } from "../geolibreRuntime.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "navigator-map-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = join(root, "runtime"); await mkdir(runtime); await mkdir(join(runtime, "assets"));
  await writeFile(join(runtime, "index.html"), "<!doctype html><title>Verified synthetic map</title>");
  await writeFile(join(root, "outside.txt"), "not public");
  await symlink(join(root, "outside.txt"), join(runtime, "escape.txt"));
  const mount = join(root, "mounted-runtime"); await symlink(runtime, mount);
  return { root, runtime, mount };
}
async function serve(t, options) {
  const middleware = geoLibreMiddleware(options);
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end("next middleware"); }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return (path, method = "GET", headers = {}) => new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: server.address().port, path, method, headers }, res => {
      const chunks = []; res.on("data", data => chunks.push(data)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    }); req.on("error", reject); req.end();
  });
}

test("verified symlink root serves real files and refuses traversal or escaping descendants", async t => {
  const { root, mount } = await fixture(t);
  assert.equal((await resolveGeoLibreFile(mount, "/geolibre/index.html?embed=1")).status, 200);
  for (const path of ["/geolibre/../outside.txt", "/geolibre/%2e%2e/outside.txt", "/geolibre/assets/%2E%2E/%2e%2e/outside.txt", "/geolibre/escape.txt", "/geolibre/%00", "/geolibre/assets%5c..%5coutside.txt"]) {
    assert.equal((await resolveGeoLibreFile(mount, path)).status, 403, path);
  }
  assert.equal((await resolveGeoLibreFile(mount, "/geolibre/%zz")).status, 400);
  const get = await serve(t, { runtimeRoot: mount, publicIndex: join(root, "absent.html") });
  const blocked = await get("/geolibre/%2e%2e/outside.txt");
  assert.equal(blocked.status, 403); assert.doesNotMatch(blocked.body, /not public|navigator-map-test|outside.txt/);
  assert.equal((await get("/%67eolibre/%2e%2e/outside.txt")).status, 403);
});

test("runtime responses carry executable MIME, HEAD and conditional-cache semantics", async t => {
  const { root, runtime } = await fixture(t);
  const types = { js: "text/javascript", css: "text/css", json: "application/json", wasm: "application/wasm", woff2: "font/woff2", png: "image/png", svg: "image/svg+xml" };
  for (const [extension, type] of Object.entries(types)) {
    await writeFile(join(runtime, "assets", `fixture.${extension}`), "fixture bytes");
    assert.ok((await resolveGeoLibreFile(runtime, `/geolibre/assets/fixture.${extension}`)).mime.startsWith(type));
  }
  const get = await serve(t, { runtimeRoot: runtime, publicIndex: join(root, "absent.html") });
  const first = await get("/geolibre/assets/fixture.js");
  assert.equal(first.status, 200); assert.equal(first.body, "fixture bytes"); assert.match(first.headers["content-type"], /^text\/javascript/);
  const head = await get("/geolibre/assets/fixture.js", "HEAD");
  assert.equal(head.status, 200); assert.equal(head.body, ""); assert.equal(head.headers["content-length"], "13");
  assert.equal((await get("/geolibre/assets/fixture.js", "GET", { "If-None-Match": first.headers.etag })).status, 304);
  assert.equal((await get("/geolibre/index.html", "POST")).status, 405);
});

test("missing runtime keeps the controlled guard and existing public/runtime fallback", async t => {
  const { root, runtime } = await fixture(t);
  const unavailable = await serve(t, { runtimeRoot: join(root, "absent"), publicIndex: join(root, "missing.html") });
  const result = await unavailable("/geolibre/index.html");
  assert.equal(result.status, 503); assert.match(result.body, /Map temporarily unavailable/); assert.doesNotMatch(result.body, /navigator-map-test/);
  assert.equal((await unavailable("/api/health")).body, "next middleware");
  const existing = await serve(t, { runtimeRoot: join(root, "absent"), publicIndex: join(runtime, "index.html") });
  assert.equal((await existing("/geolibre/index.html")).body, "next middleware");
});
