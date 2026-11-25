# Despliegue en Hugging Face Spaces (gratis, sin tarjeta)

La tienda corre como un Space Docker: el mismo frontend React y API Rust del proyecto,
en el puerto 7860. Los datos se guardan en un **dataset privado** para que sobrevivan
a los reinicios del Space.

## Archivos

- `prepare-space.sh`: genera `space/` con el código, un Dockerfile adaptado a HF y el entrypoint.
- `hf_sync.py`: restaura y sincroniza `data/jenny.db` y `uploads/` con el dataset.
- `entrypoint.sh`: arranca la API y lanza la sincronización cada 60 s.
- `generate-secrets.sh`: crea `ADMIN_PASSWORD_HASH` y `AUTH_SIGNING_KEY`.
- `deploy.sh`: crea/actualiza el Space, el dataset y los secrets desde OpenCode.

## Pasos

1. Crea cuenta en <https://huggingface.co/join> y un token **Write** en
   <https://huggingface.co/settings/tokens>.
2. Genera secretos:

   ```bash
   cd deploy/huggingface
   ./generate-secrets.sh
   ```

3. Crea `deploy/huggingface/.env` (ignorado por git) con tus valores:

   ```bash
   HF_USERNAME=tu_usuario
   HF_TOKEN=hf_...
   ADMIN_PASSWORD_HASH='pbkdf2$...'
   AUTH_SIGNING_KEY='...'
   ```

   El script lo carga automáticamente. No compartas el token en el chat.

4. Despliega:

   ```bash
   ./prepare-space.sh
   ./deploy.sh
   ```

5. Abre <https://huggingface.co/spaces/TU_USUARIO/jenny-clothing>.

El primer arranque tarda varios minutos: HF compila Rust en su infraestructura.
Los Spaces gratuitos se duermen tras un tiempo de inactividad; la primera visita
despierta el Space y `hf_sync.py` restaura la base de datos y las fotos.

## Actualizaciones

Tras cambiar código:

```bash
./prepare-space.sh && ./deploy.sh
```

Los ficheros sincronizados se pueden ver en
<https://huggingface.co/datasets/TU_USUARIO/jenny-clothing-data> (privado).

## Límites

- El plan gratuito duerme el Space: la primera petición tras dormir es lenta.
- La sincronización es cada 60 s; si el Space se detiene justo después de un cambio,
  ese último cambio puede no subir. Baja `HF_SYNC_INTERVAL` si necesitas más frecuencia.
- El token de HF se guarda como *Space secret*; no aparece en el repositorio público.
- No se usa Azure ni Oracle.
