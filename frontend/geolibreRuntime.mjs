import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".geojson": "application/geo+json",
  ".map": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf", ".eot": "application/vnd.ms-fontobject",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".pbf": "application/x-protobuf", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
};
const UNAVAILABLE = "<!doctype html><title>Map temporarily unavailable</title><p>The map could not be loaded. Please try again after the application has restarted.</p>";
const inside = (root, file) => { const path = relative(root, file); return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`)); };

/** Resolve the URL before streaming; both traversal and symlink escapes are refused. */
export async function resolveGeoLibreFile(runtimeRoot, requestUrl) {
  let pathname;
  try { pathname = decodeURIComponent((requestUrl || "/").split(/[?#]/, 1)[0]); }
  catch { return { status: 400 }; }
  if (pathname !== "/geolibre" && !pathname.startsWith("/geolibre/")) return { status: 404 };
  if (pathname.includes("\0") || pathname.includes("\\") || pathname.split("/").includes("..")) return { status: 403 };
  try {
    const root = await realpath(runtimeRoot);
    const local = pathname.slice("/geolibre".length).replace(/^\/+/, "") || "index.html";
    const candidate = resolve(root, local.endsWith("/") ? `${local}index.html` : local);
    if (!inside(root, candidate)) return { status: 403 };
    const file = await realpath(candidate);
    if (!inside(root, file)) return { status: 403 };
    const info = await stat(file);
    if (!info.isFile()) return { status: 404 };
    return { status: 200, file, size: info.size, modified: info.mtime.toUTCString(), etag: `W/"${info.size}-${Math.trunc(info.mtimeMs)}"`, mime: MIME[extname(file).toLowerCase()] || "application/octet-stream" };
  } catch (error) {
    return { status: error?.code === "ENOENT" || error?.code === "ENOTDIR" ? 404 : 503 };
  }
}

/** Vite dev and preview share this read-only mount; build never copies this root. */
export function geoLibreMiddleware({ runtimeRoot, publicIndex }) {
  return (request, response, next) => {
    const rawPath = (request.url || "/").split(/[?#]/, 1)[0];
    let decodedPath = rawPath;
    try { decodedPath = decodeURIComponent(rawPath); } catch { /* The resolver supplies a controlled malformed-URL response. */ }
    if (![rawPath, decodedPath].some(path => path === "/geolibre" || path.startsWith("/geolibre/"))) { next(); return; }
    const finish = (status, message) => {
      response.statusCode = status;
      response.removeHeader("Content-Length");
      response.removeHeader("ETag");
      response.removeHeader("Last-Modified");
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.end(request.method === "HEAD" ? undefined : message);
    };
    void (async () => {
      const runtime = await resolveGeoLibreFile(runtimeRoot, "/geolibre/index.html");
      if (runtime.status !== 200) {
        try { if ((await stat(publicIndex)).isFile()) { next(); return; } } catch { /* Keep the existing public/dist guard. */ }
        finish(503, UNAVAILABLE); return;
      }
      if (!["GET", "HEAD"].includes(request.method || "GET")) {
        response.setHeader("Allow", "GET, HEAD"); finish(405, "<!doctype html><title>Method unavailable</title><p>This map resource is read-only.</p>"); return;
      }
      const asset = await resolveGeoLibreFile(runtimeRoot, request.url);
      if (asset.status !== 200) {
        finish(asset.status, asset.status === 503 ? UNAVAILABLE : "<!doctype html><title>Map resource unavailable</title><p>The requested map resource is unavailable.</p>"); return;
      }
      response.setHeader("Content-Type", asset.mime);
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Cache-Control", "no-cache");
      response.setHeader("ETag", asset.etag);
      response.setHeader("Last-Modified", asset.modified);
      if (request.headers["if-none-match"] === asset.etag) { response.statusCode = 304; response.end(); return; }
      response.statusCode = 200;
      response.setHeader("Content-Length", asset.size);
      if (request.method === "HEAD") { response.end(); return; }
      const stream = createReadStream(asset.file);
      stream.on("error", () => { if (response.headersSent) response.destroy(); else finish(503, UNAVAILABLE); });
      response.on("close", () => stream.destroy());
      stream.pipe(response);
    })().catch(() => { if (!response.headersSent) finish(503, UNAVAILABLE); else response.destroy(); });
  };
}
