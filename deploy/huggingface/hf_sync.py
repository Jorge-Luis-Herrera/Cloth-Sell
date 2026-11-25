#!/usr/bin/env python3
"""Sincroniza /app/data y /app/uploads con un dataset privado de Hugging Face."""
import hashlib
import json
import os
import shutil
import sqlite3
import tempfile
from pathlib import Path

from huggingface_hub import HfApi, hf_hub_download

REPO = os.environ.get("HF_DATASET_REPO", "")
TOKEN = os.environ.get("HF_TOKEN", "")
DATA = Path(os.environ.get("DATABASE_SYNC_DIR", "/app/data"))
UPLOADS = Path(os.environ.get("UPLOADS_DIR", "/app/uploads"))
STATE = Path(os.environ.get("HF_SYNC_STATE", "/app/.hf_sync_state.json"))
api = HfApi(token=TOKEN)


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def pull() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    UPLOADS.mkdir(parents=True, exist_ok=True)
    state = {}
    for remote in api.list_repo_files(REPO, repo_type="dataset", token=TOKEN):
        if not (remote.startswith("data/") or remote.startswith("uploads/")):
            continue
        dest = Path("/app") / remote
        dest.parent.mkdir(parents=True, exist_ok=True)
        cached = hf_hub_download(REPO, remote, repo_type="dataset", token=TOKEN)
        if dest.exists():
            dest.chmod(0o664)
        shutil.copy2(cached, dest)
        dest.chmod(0o664)  # la cache de HF es 0444; sin esto SQLite queda sololectura
        state[remote] = digest(dest)
        print(f"restaurado {remote}")
    STATE.write_text(json.dumps(state))


def push() -> None:
    if not STATE.exists():
        pull()
        return
    state = json.loads(STATE.read_text())
    files = []

    db = DATA / "jenny.db"
    if db.exists():
        with tempfile.TemporaryDirectory(dir=DATA) as td:
            backup = Path(td) / "jenny.db"
            src = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
            dst = sqlite3.connect(backup)
            src.backup(dst)
            dst.close()
            src.close()
            files.append(("data/jenny.db", backup))
            changed = _upload(files, state)
    else:
        changed = []

    files = []
    for p in UPLOADS.rglob("*"):
        if p.is_file():
            files.append((f"uploads/{p.relative_to(UPLOADS)}", p))
    changed += _upload(files, state)

    STATE.write_text(json.dumps(state))
    for remote in changed:
        print(f"sincronizado {remote}")


def _upload(files, state):
    changed = []
    for remote, local in files:
        sig = digest(local)
        if state.get(remote) == sig:
            continue
        api.upload_file(
            path_or_fileobj=str(local),
            path_in_repo=remote,
            repo_id=REPO,
            repo_type="dataset",
            token=TOKEN,
        )
        state[remote] = sig
        changed.append(remote)
    return changed


if __name__ == "__main__":
    import sys

    if not REPO or not TOKEN:
        raise SystemExit("HF_DATASET_REPO y HF_TOKEN son obligatorios")
    action = sys.argv[1] if len(sys.argv) > 1 else "push"
    (pull if action == "pull" else push)()
