#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
: "${ACR_NAME:?Set ACR_NAME}"; : "${RESOURCE_GROUP:?Set RESOURCE_GROUP}"; : "${WEB_APP:?Set WEB_APP}"; : "${ADMIN_PASSWORD_HASH:?Set ADMIN_PASSWORD_HASH}"; : "${AUTH_SIGNING_KEY:?Set AUTH_SIGNING_KEY}"
IMAGE_NAME="${IMAGE_NAME:-jenny-clothing}"
TAG="$(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || echo local)"
IMAGE="$ACR_NAME.azurecr.io/$IMAGE_NAME"
if [[ "${1:-}" != "--skip-tests" ]]; then docker build --target backend-build "$PROJECT_DIR"; fi
docker build -t "$IMAGE:$TAG" -t "$IMAGE:latest" "$PROJECT_DIR"
docker push "$IMAGE:$TAG"; docker push "$IMAGE:latest"
az webapp config appsettings set --name "$WEB_APP" --resource-group "$RESOURCE_GROUP" --settings ADMIN_PASSWORD_HASH="$ADMIN_PASSWORD_HASH" AUTH_SIGNING_KEY="$AUTH_SIGNING_KEY" ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-}" ConnectionStrings__Default="Data Source=/app/data/jenny.db" UPLOADS_DIR="/app/uploads" WEBSITES_PORT=8080 --output none
az webapp config set --name "$WEB_APP" --resource-group "$RESOURCE_GROUP" --linux-fx-version "DOCKER|$IMAGE:$TAG" --always-on true --generic-configurations '{"healthCheckPath":"/api/health"}' --output none
az webapp restart --name "$WEB_APP" --resource-group "$RESOURCE_GROUP" --output none
FQDN="$(az webapp show --name "$WEB_APP" --resource-group "$RESOURCE_GROUP" --query defaultHostName --output tsv)"
curl --fail --retry 12 --retry-delay 10 "https://$FQDN/api/health"
printf '\nDeployed %s to https://%s\n' "$IMAGE:$TAG" "$FQDN"
