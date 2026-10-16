#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
: "${ACR_NAME:?Set ACR_NAME}"; : "${RESOURCE_GROUP:?Set RESOURCE_GROUP}"; : "${WEB_APP:?Set WEB_APP}"; : "${ADMIN_PASSWORD_HASH:?Set ADMIN_PASSWORD_HASH}"; : "${AUTH_SIGNING_KEY:?Set AUTH_SIGNING_KEY}"
IMAGE_NAME="${IMAGE_NAME:-jenny-clothing}"
TAG="$(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || echo local)"
IMAGE="$ACR_NAME.azurecr.io/$IMAGE_NAME"
# Secrets must never be mangled: ADMIN_PASSWORD_HASH contains '$' separators.
# Fail fast with a clear message if the hash does not look like pbkdf2.
if [[ "$ADMIN_PASSWORD_HASH" != pbkdf2\$*\$*\$* ]]; then
  echo "ADMIN_PASSWORD_HASH is malformed (expected pbkdf2\$iterations\$salt\$hash)." >&2
  echo "If you sourced it from a file, wrap the value in single quotes." >&2
  exit 2
fi

if [[ "${1:-}" != "--skip-tests" ]]; then docker build --target backend-build "$PROJECT_DIR"; fi
# DOCKERFILE lets you reuse an already-compiled binary (Dockerfile.prebuilt) to skip the slow Rust build.
DOCKERFILE="${DOCKERFILE:-$PROJECT_DIR/Dockerfile}"
docker build -f "$DOCKERFILE" -t "$IMAGE:$TAG" -t "$IMAGE:latest" "$PROJECT_DIR"

# Docker happily reuses a cached COPY layer for the binary, which silently ships the
# PREVIOUS build. Verify the binary inside the image really is the one we just
# compiled, otherwise the deploy would look green and serve old code.
LOCAL_BIN="$PROJECT_DIR/Backend-Rust/target/release/jenny-api"
if [[ -f "$LOCAL_BIN" ]]; then
  local_sum="$(sha256sum "$LOCAL_BIN" | cut -d' ' -f1)"
  image_sum="$(docker run --rm --entrypoint sha256sum "$IMAGE:$TAG" /app/jenny-api | cut -d' ' -f1)"
  if [[ "$local_sum" != "$image_sum" ]]; then
    echo "Stale binary in image (docker cache reused the COPY layer)." >&2
    echo "Rebuild with: docker build --no-cache -f $DOCKERFILE -t $IMAGE:$TAG $PROJECT_DIR" >&2
    exit 3
  fi
  echo "Binary in image matches the local build."
fi

docker push "$IMAGE:$TAG"; docker push "$IMAGE:latest"

# App Service must authenticate to the registry. A stale DOCKER_REGISTRY_SERVER_URL
# (e.g. left pointing at mcr.microsoft.com) makes the image pull fail with
# ImagePullUnauthorizedFailure, so always pin it to this ACR.
ACR_USER="$(az acr credential show --name "$ACR_NAME" --query username --output tsv)"
ACR_PASSWORD="$(az acr credential show --name "$ACR_NAME" --query 'passwords[0].value' --output tsv)"

az webapp config appsettings set --name "$WEB_APP" --resource-group "$RESOURCE_GROUP" --settings ADMIN_PASSWORD_HASH="$ADMIN_PASSWORD_HASH" AUTH_SIGNING_KEY="$AUTH_SIGNING_KEY" ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-}" DATABASE_URL="sqlite:///app/data/jenny.db?mode=rwc" UPLOADS_DIR="/app/uploads" WEBSITES_PORT=8080 DOCKER_REGISTRY_SERVER_URL="https://$ACR_NAME.azurecr.io" DOCKER_REGISTRY_SERVER_USERNAME="$ACR_USER" DOCKER_REGISTRY_SERVER_PASSWORD="$ACR_PASSWORD" --output none
az webapp config set --name "$WEB_APP" --resource-group "$RESOURCE_GROUP" --linux-fx-version "DOCKER|$IMAGE:$TAG" --always-on true --generic-configurations '{"healthCheckPath":"/api/health"}' --output none
az webapp restart --name "$WEB_APP" --resource-group "$RESOURCE_GROUP" --output none
FQDN="$(az webapp show --name "$WEB_APP" --resource-group "$RESOURCE_GROUP" --query defaultHostName --output tsv)"
curl --fail --retry 12 --retry-delay 10 "https://$FQDN/api/health"
printf '\nDeployed %s to https://%s\n' "$IMAGE:$TAG" "$FQDN"
