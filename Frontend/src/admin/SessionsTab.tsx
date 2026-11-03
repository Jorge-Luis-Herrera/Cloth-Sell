import { useState } from 'react';
import { api, type CatalogSession } from '../api';
import { useToast } from './ui';

type SessionDraft = { name: string; description: string; sortOrder: string; visible: boolean };

const emptyDraft = (): SessionDraft => ({ name: '', description: '', sortOrder: '0', visible: true });

export function SessionsTab({ token, sessions, onChanged }: { token: string; sessions: CatalogSession[]; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [draft, setDraft] = useState<SessionDraft>(emptyDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const edit = (session: CatalogSession) => {
    setEditing(session.id);
    setDraft({ name: session.name, description: session.description, sortOrder: String(session.sortOrder), visible: session.visible });
  };

  const reset = () => { setEditing(null); setDraft(emptyDraft()); };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim() || busy) return;
    setBusy(true);
    try {
      const data = { name: draft.name.trim(), description: draft.description.trim(), sortOrder: Number(draft.sortOrder) || 0, visible: draft.visible };
      if (editing) await api.updateSession(token, editing, data);
      else await api.createSession(token, data);
      await onChanged();
      toast.success(editing ? 'Sesion actualizada.' : 'Sesion creada.');
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la sesion.');
    } finally {
      setBusy(false);
    }
  };

  const toggleVisible = async (session: CatalogSession) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.updateSession(token, session.id, { name: session.name, description: session.description, sortOrder: session.sortOrder, visible: !session.visible });
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cambiar la visibilidad.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (session: CatalogSession) => {
    if (busy || !window.confirm(`¿Eliminar la sesion "${session.name}"? Los productos quedaran sin sesion.`)) return;
    setBusy(true);
    try {
      await api.deleteSession(token, session.id);
      await onChanged();
      if (editing === session.id) reset();
      toast.success('Sesion eliminada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar la sesion.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Sesiones</h1>
          <p>Organiza el catalogo por tipos de prendas.</p>
        </div>
      </header>

      <form className="adm-session-form" onSubmit={save}>
        <div className="adm-session-form-title">{editing ? 'Editar sesion' : 'Nueva sesion'}</div>
        <div className="adm-row2">
          <div className="adm-field">
            <label htmlFor="session-name">Nombre</label>
            <input id="session-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Monos" required disabled={busy} />
          </div>
          <div className="adm-field">
            <label htmlFor="session-order">Orden</label>
            <input id="session-order" type="number" min="0" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })} disabled={busy} />
          </div>
        </div>
        <div className="adm-field">
          <label htmlFor="session-description">Descripcion</label>
          <textarea id="session-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Prendas de una pieza" disabled={busy} />
        </div>
        <label className="adm-session-visible"><input type="checkbox" checked={draft.visible} onChange={(event) => setDraft({ ...draft, visible: event.target.checked })} disabled={busy} /> Visible en la tienda</label>
        <div className="adm-session-actions">
          <button type="submit" className="adm-btn adm-btn-primary" disabled={busy || !draft.name.trim()}>{editing ? 'Guardar cambios' : 'Crear sesion'}</button>
          {editing && <button type="button" className="adm-btn" onClick={reset} disabled={busy}>Cancelar</button>}
        </div>
      </form>

      <div className="adm-session-list">
        {sessions.length === 0 ? <div className="adm-empty"><h3>No hay sesiones</h3><p>Crea la primera para organizar tus prendas.</p></div> : sessions.map((session) => (
          <article className="adm-session-card" key={session.id}>
            <div>
              <div className="adm-session-card-title"><h3>{session.name}</h3><span className="adm-session-order">#{session.sortOrder}</span></div>
              {session.description && <p>{session.description}</p>}
              <span className="adm-session-state">{session.productCount} {session.productCount === 1 ? 'prenda' : 'prendas'} · {session.visible ? 'Visible en la tienda' : 'Oculta en la tienda'}</span>
            </div>
            <div className="adm-card-actions">
              <button type="button" className="adm-btn adm-btn-sm" onClick={() => edit(session)} disabled={busy}>Editar</button>
              <button type="button" className="adm-btn adm-btn-sm" onClick={() => void toggleVisible(session)} disabled={busy}>{session.visible ? 'Ocultar' : 'Mostrar'}</button>
              <button type="button" className="adm-btn adm-btn-sm adm-btn-danger" onClick={() => void remove(session)} disabled={busy}>Borrar</button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
