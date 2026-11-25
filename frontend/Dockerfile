FROM node:24-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build
FROM nginx:1.30.6-alpine@sha256:583b7f2fce1cdb8da5ad5c39ebd3c33b98b87d493190e548bdee1fa8c619c311
COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md /usr/share/licenses/modavis-navigator/
HEALTHCHECK --interval=30s --timeout=15s --start-period=30s --retries=3 \
    CMD wget -q -T 12 -O /dev/null http://127.0.0.1/api/health/ready || exit 1
EXPOSE 80
