FROM node:22-bookworm-slim AS frontend-build
WORKDIR /src/Frontend
COPY Frontend/package*.json ./
RUN npm ci
COPY Frontend/ ./
RUN npm run build

FROM rust:1.89-bookworm AS backend-build
WORKDIR /src
COPY Backend-Rust/Cargo.toml Backend-Rust/Cargo.lock* Backend-Rust/
COPY Backend-Rust/src Backend-Rust/src
WORKDIR /src/Backend-Rust
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 curl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system jenny && useradd --system --gid jenny --home /app --shell /usr/sbin/nologin jenny
WORKDIR /app
COPY --from=backend-build /src/Backend-Rust/target/release/jenny-api /app/jenny-api
COPY --from=frontend-build /src/Frontend/dist /app/Frontend/dist
RUN mkdir -p /app/data /app/uploads && chown -R jenny:jenny /app
USER jenny
ENV PORT=8080
ENV DATABASE_URL="sqlite:///app/data/jenny.db?mode=rwc"
ENV UPLOADS_DIR=/app/uploads
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl --fail --silent http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["/app/jenny-api"]
