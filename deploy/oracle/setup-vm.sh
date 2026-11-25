#!/usr/bin/env bash
# Se ejecuta DENTRO de la VM Ubuntu ARM de Oracle.
set -euo pipefail

if docker compose version >/dev/null 2>&1; then
  echo "Docker Compose ya disponible"
else
  sudo apt-get update -qq
  sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg lsb-release

  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | sudo gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  if [[ ! -f /etc/apt/sources.list.d/docker.list ]]; then
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
      | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  fi

  sudo apt-get update -qq
  sudo apt-get install -y --no-install-recommends \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git
fi

sudo systemctl enable --now docker

# Oracle ya abre el puerto 22. Si ufw esta activo, abrimos tambien web.
if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q '^Status: active'; then
  sudo ufw allow 22/tcp >/dev/null
  sudo ufw allow 80/tcp >/dev/null
  sudo ufw allow 443/tcp >/dev/null
fi

echo "VM lista: $(docker --version) / $(docker compose version)"
