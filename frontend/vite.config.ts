import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin, type ViteDevServer, type PreviewServer } from "vite";
import react from "@vitejs/plugin-react";

const navigatorBackendUrl = process.env.NAVIGATOR_BACKEND_URL || "http://127.0.0.1:8506";
const geolibreRuntimeIndex = fileURLToPath(
  new URL("./public/geolibre/index.html", import.meta.url),
);

function guardMissingGeoLibreRuntime(): Plugin {
  const install = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((request, response, next) => {
      const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
      const runtimeIndex = "httpServer" in server && "watcher" in server
        ? geolibreRuntimeIndex
        : fileURLToPath(new URL("./dist/geolibre/index.html", import.meta.url));
      if (!pathname.startsWith("/geolibre/") || existsSync(runtimeIndex)) {
        next();
        return;
      }
      response.statusCode = 503;
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end("<!doctype html><title>Map temporarily unavailable</title><p>The map could not be loaded. Please try again after the application has restarted.</p>");
    });
  };
  return {
    name: "modavis-geolibre-runtime-guard",
    configureServer: install,
    configurePreviewServer: install,
  };
}

export default defineConfig({
  plugins: [guardMissingGeoLibreRuntime(), react()],
  build: {
    rolldownOptions: {
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
      "/api": navigatorBackendUrl,
      "/dataset": navigatorBackendUrl,
      "/resolve": navigatorBackendUrl,
      "/vocab/event-type/": navigatorBackendUrl
    }
  }
});
