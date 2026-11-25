# Despliegue en Oracle Cloud Always Free (VM ARM)

Sustituye al App Service de Azure. La VM ejecuta el mismo `Dockerfile`: compila React + Rust en ARM y sirve todo en `:8080`. Caddy publica HTTP o HTTPS y los datos viven en volúmenes Docker.

## Lo que ya está preparado aquí

- `docker-compose.yml`: app + Caddy, volúmenes `jenny-data` y `jenny-uploads`.
- `Caddyfile.http` / `Caddyfile.domain`: se elige solo según si defines `DOMAIN`.
- `generate-secrets.sh`: crea `ADMIN_PASSWORD_HASH` y `AUTH_SIGNING_KEY`.
- `setup-vm.sh`: instala Docker en la VM (se copia y ejecuta solo).
- `deploy.sh`: clona/actualiza el repo, escribe secretos y levanta los contenedores.
- `backup.sh`: se ejecuta en la VM y guarda SQLite + fotos.

Clave SSH generada para este despliegue:

```bash
cat ~/.ssh/id_ed25519_oracle.pub
```

## Pasos que requieren tu cuenta de Oracle (no se pueden hacer desde OpenCode)

1. Crea cuenta en <https://www.oracle.com/cloud/free/> y verifica el método de pago (no se cobra dentro del Always Free).
2. **Compute → Instances → Create instance**:
   - Name: `jenny-clothing`
   - Image: **Ubuntu 22.04 LTS ARM64**
   - Shape: **VM.Standard.A1.Free** (4 OCPU / 24 GB)
   - SSH key: pega el contenido de `~/.ssh/id_ed25519_oracle.pub`
   - Deja la IP pública asignada.
3. Anota la **IP pública** y el usuario (`ubuntu`).
4. **Networking → VCN → Security Lists → Default Security List → Add Ingress Rule**:
   - `0.0.0.0/0`, TCP, **80**
   - `0.0.0.0/0`, TCP, **443**
   - (22 ya suele estar abierta para SSH)
5. Opcional: apunta un dominio (`A record`) a la IP pública para tener HTTPS automático. Sin dominio, la tienda queda en `http://IP`.

## Despliegue desde OpenCode

```bash
cd deploy/oracle
./generate-secrets.sh          # pega las dos líneas en .env
cp .env.example .env
# edita .env: pega secretos y pon DOMAIN= (o tu dominio)
./deploy.sh IP_PUBLICA ubuntu
```

El build de Rust en ARM puede tardar varios minutos la primera vez. Al terminar verás `/api/health` y la URL final.

## Operaciones

```bash
# para actualizar a lo ultimo de main, vuelve a ejecutar desde tu maquina:
./deploy.sh IP_PUBLICA ubuntu

# backup en la VM:
ssh -i ~/.ssh/id_ed25519_oracle ubuntu@IP_PUBLICA \
  'bash ~/Cloth-Sell/deploy/oracle/backup.sh'

# logs:
ssh -i ~/.ssh/id_ed25519_oracle ubuntu@IP_PUBLICA \
  'cd ~/Cloth-Sell/deploy/oracle && sudo docker compose logs -f app'
```

## Notas

- No se usa Azure: ni ACR, ni App Service, ni `az`.
- Si el puerto 443 falla con dominio, revisa que el DNS ya resolvió y que Caddy tenga el puerto 80 abierto (lo necesita para el reto HTTP-01 de Let's Encrypt).
- Esta configuración asume una sola réplica, igual que el MVP con SQLite.
