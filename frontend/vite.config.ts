import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin, type ViteDevServer, type PreviewServer } from "vite";
import react from "@vitejs/plugin-react";
import { geoLibreMiddleware } from "./geolibreRuntime.mjs";
import { germanPreviewCopyPlugin } from "./germanPreviewCopy.mjs";
import { basemapDevRelay } from "./basemapDevRelay.mjs";

const navigatorBackendUrl = process.env.NAVIGATOR_BACKEND_URL || "http://127.0.0.1:8506";
const geolibreRuntimeIndex = fileURLToPath(
  new URL("./public/geolibre/index.html", import.meta.url),
);
const frontendRoot = fileURLToPath(new URL(".", import.meta.url));
const geolibreRuntimeRoot = resolve(frontendRoot, process.env.NAVIGATOR_GEOLIBRE_RUNTIME || ".runtime/geolibre");

function guardMissingGeoLibreRuntime(): Plugin {
  const install = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use(basemapDevRelay(server.config.publicDir));
    server.middlewares.use(geoLibreMiddleware({
      runtimeRoot: geolibreRuntimeRoot,
      publicIndex: "httpServer" in server && "watcher" in server
        ? geolibreRuntimeIndex
        : resolve(frontendRoot, server.config.build.outDir, "geolibre/index.html"),
    }));
  };
  return {
    name: "modavis-geolibre-runtime-guard",
    configureServer: install,
    configurePreviewServer: install,
  };
}

export default defineConfig({
  plugins: [guardMissingGeoLibreRuntime(), germanPreviewCopyPlugin(frontendRoot), react()],
  build: {
    rolldownOptions: {
      input: {
        index: resolve(frontendRoot, "index.html"),
        "map-viewer": resolve(frontendRoot, "map-viewer.html"),
      },
      output: {
        codeSplitting: {
          groups: [
            {
              name: "vendor-react",
              test: /node_modules[\\/](react|react-dom)[\\/]/,
              priority: 20
            },
            {
              name: "vendor-icons",
              test: /node_modules[\\/]lucide-react[\\/]/,
              priority: 10
            }
          ]
        }
      }
    }
  },
  server: {
    proxy: {
      "^/api/(?:map/marker-style\\.json|areas/[^/]+/map/style\\.json)(?:\\?|$)": {
        target: navigatorBackendUrl,
        changeOrigin: false,
      },
      "/api": navigatorBackendUrl,
      "/dataset": navigatorBackendUrl,
      "/resolve": navigatorBackendUrl,
      "/vocab/event-type/": navigatorBackendUrl
    }
  }
});
