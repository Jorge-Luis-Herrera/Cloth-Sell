FROM node:22-bookworm-slim AS frontend-build
WORKDIR /src/Frontend
COPY Frontend/package*.json ./
RUN npm ci
COPY Frontend/ ./
RUN npm run build

FROM rust:1.89-bookworm AS backend-build
WORKDIR /src
COPY Backend-Rust/Cargo.toml Backend-Rust/Cargo.lock* Backend-Rust/
# Las migraciones se incrustan al compilar (`sqlx::migrate!`), asi que tienen que estar presentes
# en ese momento: si faltan, el build falla con "error canonicalizing migration directory".
COPY Backend-Rust/migrations Backend-Rust/migrations
COPY Backend-Rust/src Backend-Rust/src
WORKDIR /src/Backend-Rust
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 curl python3 python3-pip \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system jenny && useradd --system --gid jenny --home /app --shell /usr/sbin/nologin jenny
WORKDIR /app
COPY --from=backend-build /src/Backend-Rust/target/release/jenny-api /app/jenny-api
COPY --from=frontend-build /src/Frontend/dist /app/Frontend/dist
RUN mkdir -p /app/data /app/uploads && chown -R jenny:jenny /app
RUN pip3 install --no-cache-dir --break-system-packages huggingface_hub
COPY deploy/huggingface/hf_sync.py deploy/huggingface/entrypoint.sh /app/
RUN chmod +x /app/hf_sync.py /app/entrypoint.sh && chown jenny:jenny /app/hf_sync.py /app/entrypoint.sh
USER jenny
ENV PORT=10000
ENV DATABASE_URL="sqlite:///app/data/jenny.db?mode=rwc"
ENV UPLOADS_DIR=/app/uploads
EXPOSE 10000
ENTRYPOINT ["/app/entrypoint.sh"]
