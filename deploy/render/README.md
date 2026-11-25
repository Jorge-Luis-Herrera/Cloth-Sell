# Despliegue en Render free + dataset de Hugging Face

Render ejecuta el mismo Docker (React + Rust) sin tarjeta en el plan free. Como el
disco de Render es efímero y el servicio duerme, `hf_sync.py` guarda `jenny.db` y
`uploads/` en un dataset privado de HF y los restaura al arrancar.

## Preparado aquí

- `render.yaml` en la raíz: define el servicio Docker, el plan free y los secrets.
- `prepare-render.sh`: genera `deploy/render/Dockerfile` desde el Dockerfile principal
  (puerto 10000, sin HEALTHCHECK interno, con `hf_sync.py` y `entrypoint.sh`).
- `init-hf-dataset.sh`: crea el dataset privado en HF.
- `.env.example`: plantilla con usuario, dataset y secretos.

## Pasos

1. **Revoca el token anterior** en <https://huggingface.co/settings/tokens> y crea uno nuevo **Write**.
2. Genera los secretos (o reutiliza `deploy/huggingface/.admin_password`):

   ```bash
   cd deploy/render
   cp .env.example .env
   # edita .env: pega el token NUEVO, ADMIN_PASSWORD_HASH y AUTH_SIGNING_KEY
   ./init-hf-dataset.sh
   ```

3. Genera el Dockerfile y sube el repo a GitHub:

   ```bash
   ./prepare-render.sh
   cd ../..
   git add render.yaml deploy/render deploy/huggingface/hf_sync.py deploy/huggingface/entrypoint.sh
   git commit -m "deploy: render free con persistencia en HF"
   git push origin recuperacion
   ```

4. En Render: **New → Blueprint** → selecciona el repo y la rama `recuperacion`.
   Render leerá `render.yaml` y te pedirá tres valores:
   - `ADMIN_PASSWORD_HASH`
   - `AUTH_SIGNING_KEY`
   - `HF_TOKEN` (el nuevo)

5. URL final: `https://jenny-clothing.onrender.com`.

## Funcionamiento

- Render define `PORT=10000`; el backend ya lee esa variable.
- `render.yaml` usa `healthCheckPath: /api/health`.
- Al arrancar, `entrypoint.sh` hace `hf_sync.py pull` y luego levanta la API.
- Cada 60 s se hace `push` al dataset privado.

## Avisos

- Plan free: el servicio se duerme tras ~15 min sin tráfico; la primera visita tarda.
- El dataset de HF es privado; el token viaja como *secret* de Render, no al repo.
- Si cambias el código, ejecuta `./prepare-render.sh`, haz commit y push; Render reconstruye.
- No se usa Azure ni Oracle.
