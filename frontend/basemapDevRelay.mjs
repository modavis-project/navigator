import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const provider = "https://tiles.openfreemap.org";
const prefix = "/basemap/openfreemap/v2";
const stylePath = "/basemap/assets-v2/style.json";
const spritePath = prefix + "/sprites/ofm_f384/ofm";
const mapAsset = /^\/(?:planet|planet\/[0-9]{8}_[0-9]{6}_[a-z]{2}\/(?:[0-9]|1[0-4])\/[0-9]{1,5}\/[0-9]{1,5}\.pbf|fonts\/Noto Sans (?:Regular|Bold|Italic)\/[0-9]{1,6}-[0-9]{1,6}\.pbf|sprites\/ofm_f384\/ofm(?:@2x)?\.(?:json|png))$/;
const localLicense = /^\/fonts\/Noto Sans (?:Regular|Bold)\/LICENSE\.md$/;

export function basemapDevRelay(publicDir) {
  return async (request, response, next) => {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
    if (pathname === stylePath && ["GET", "HEAD"].includes(request.method)) {
      const scheme = request.headers["x-forwarded-proto"] === "https" || request.socket.encrypted
        ? "https"
        : "http";
      try {
        const origin = new URL(`${scheme}://${request.headers.host}`).origin;
        const style = await readFile(join(publicDir, stylePath), "utf-8");
        response.writeHead(200, { "Content-Type": "application/json" }).end(
          style.replace(`"${spritePath}"`, `"${origin}${spritePath}"`),
        );
      } catch {
        response.writeHead(500).end();
      }
      return;
    }
    if (!pathname.startsWith(prefix + "/")) return next();
    let asset;
    try {
      asset = decodeURIComponent(pathname.slice(prefix.length));
    } catch {
      response.writeHead(404).end();
      return;
    }
    if (localLicense.test(asset)) return next();
    if (!mapAsset.test(asset) || !["GET", "HEAD"].includes(request.method)) {
      response.writeHead(404).end();
      return;
    }
    if (existsSync(join(publicDir, prefix, asset))) return next();
    try {
      const remote = await fetch(new URL(asset, provider), {
        method: request.method,
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: { "User-Agent": "MODAVIS Navigator (https://navigator.modavis.org)" },
      });
      const contentType = remote.headers.get("content-type");
      if (contentType) response.setHeader("Content-Type", contentType);
      const cacheControl = remote.headers.get("cache-control");
      if (cacheControl) response.setHeader("Cache-Control", cacheControl);
      response.statusCode = remote.status;
      const body = asset === "/planet" && remote.ok
        ? (await remote.text()).replaceAll(provider + "/planet/", prefix + "/planet/")
        : Buffer.from(await remote.arrayBuffer());
      response.end(body);
    } catch {
      response.writeHead(502).end();
    }
  };
}
