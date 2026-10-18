import { useEffect, useRef, useState } from 'react';
import { api, type Product, type ProductImage } from '../api';
import { Confirm, useToast } from './ui';
import { VariantsEditor } from './VariantsEditor';

const MAX_UPLOAD = 5 * 1024 * 1024;
const MAX_PHOTOS = 30;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

/** Foto elegida antes de que el producto exista: el endpoint de subida necesita un id de
 *  producto, asi que en el alta se envia en cuanto createProduct devuelve el id. */
type Pending = { key: string; file: File; preview: string };

let seq = 0;
const key = () => `pending-${++seq}`;

export function ProductDialog({ token, product, onClose, onChanged }: { token: string; product: Product | null; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const isNew = product === null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [progress, setProgress] = useState<{ percent: number | null; index: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busyImage, setBusyImage] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [editingAlt, setEditingAlt] = useState<{ id: string; value: string } | null>(null);

  const uploading = progress !== null;
  const busy = saving || uploading;
  const photos = product?.images ?? [];
  const totalPhotos = photos.length + pending.length;

  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setDescription(product.description ?? '');
    setBasePrice(String(product.basePrice ?? ''));
    setPublished(Boolean(product.published));
  }, [product]);

  // Libera los object URL de las vistas previas para no filtrar memoria.
  useEffect(() => () => { for (const p of pending) URL.revokeObjectURL(p.preview); }, [pending]);

  // Mientras se guarda o se sube, cerrar el dialogo dejaria el proceso a medias y el usuario
  // podria abrir otro y crear un producto duplicado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy && !pendingDelete) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pendingDelete, busy]);

  const addFiles = (files: File[]) => {
    if (busy) return;
    const accepted: Pending[] = [];
    let rechazados = 0;
    let sinEspacio = 0;
    for (const file of files) {
      if (totalPhotos + accepted.length >= MAX_PHOTOS) { sinEspacio += 1; continue; }
      if (!ACCEPTED.includes(file.type)) { rechazados += 1; continue; }
      if (file.size > MAX_UPLOAD) { rechazados += 1; continue; }
      accepted.push({ key: key(), file, preview: URL.createObjectURL(file) });
    }
    if (accepted.length) setPending((current) => [...current, ...accepted]);
    if (rechazados) toast.error(`${rechazados} ${rechazados === 1 ? 'archivo no se aceptó' : 'archivos no se aceptaron'}: solo JPG, PNG o WebP de hasta 5 MB.`);
    if (sinEspacio) toast.error(`Como maximo ${MAX_PHOTOS} fotos por producto.`);
    if (fileInput.current) fileInput.current.value = '';
  };

  const discardPending = (target: string) => {
    setPending((current) => {
      const found = current.find((p) => p.key === target);
      if (found) URL.revokeObjectURL(found.preview);
      return current.filter((p) => p.key !== target);
    });
  };

  /** Sube las fotos pendientes de una en una. El progreso es agregado: cada foto aporta su
   *  porcentaje y se muestra el total, en vez de un spinner sin información. */
  const uploadAll = async (productId: string) => {
    const files = pending;
    if (!files.length) return;
    setProgress({ percent: 0, index: 0, total: files.length });
    try {
      for (const [index, item] of files.entries()) {
        setProgress({ percent: 0, index, total: files.length });
        await api.uploadImage(token, productId, item.file, name.trim() || product?.name || '', (percent) => {
          setProgress({ percent, index, total: files.length });
        });
        discardPending(item.key);
      }
      toast.success(files.length === 1 ? 'Foto subida.' : `${files.length} fotos subidas.`);
    } finally {
      setProgress(null);
    }
  };

  const removeImage = async (imageId: string) => {
    if (!product) return;
    setBusyImage(imageId);
    try {
      await api.deleteImage(token, product.id, imageId);
      await onChanged();
      toast.success('Foto eliminada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar la foto.');
    } finally {
      setBusyImage(null);
      setPendingDelete(null);
    }
  };

  /** Mueve una foto dentro de la galeria. La primera es la portada de la tienda. */
  const moveImage = async (index: number, destino: number) => {
    if (!product) return;
    const orden = photos.map((i) => i.id);
    const [movida] = orden.splice(index, 1);
    orden.splice(destino, 0, movida);
    setBusyImage(movida);
    try {
      await api.reorderImages(token, product.id, orden);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el orden.');
    } finally {
      setBusyImage(null);
    }
  };

  const saveAlt = async (image: ProductImage) => {
    if (!product || !editingAlt || editingAlt.id !== image.id) return;
    setBusyImage(image.id);
    try {
      await api.setImageAlt(token, product.id, image.id, editingAlt.value);
      await onChanged();
      setEditingAlt(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar el texto.');
    } finally {
      setBusyImage(null);
    }
  };

  const submit = async () => {
    if (busy) return; // doble clic: no repetir la operacion
    const price = Number(basePrice);
    if (!name.trim()) return toast.error('El nombre es obligatorio.');
    if (!Number.isFinite(price) || price <= 0) return toast.error('Escribe un precio mayor que cero.');

    setSaving(true);
    try {
      const payload = { name: name.trim(), description: description.trim(), basePrice: price, published };
      if (product) {
        await api.updateProduct(token, product.id, payload);
        // En edicion la foto pendiente se sube ahora que ya sabemos el id.
        await uploadAll(product.id);
        toast.success('Cambios guardados.');
      } else {
        const created = await api.createProduct(token, payload);
        await uploadAll(created.id);
        toast.success('Producto creado.');
      }
      await onChanged();
      onClose();
    } catch (e) {
      // El producto ya existe aunque la foto falle: se avisa para no perderlo.
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  };

  const closeSafely = () => { if (!busy) onClose(); };

  const progressoTotal = progress ? (progress.index * 100 + (progress.percent ?? 0)) / progress.total : 0;

  return (
    <div className="adm-modal-wrap" onClick={closeSafely} role="presentation">
      <div className="adm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={isNew ? 'Nuevo producto' : 'Editar producto'}>
        <header className="adm-modal-head">
          <div>
            <h2>{isNew ? 'Nuevo producto' : 'Editar producto'}</h2>
            <p>{isNew ? 'Nombre, precio y fotos. Las tallas se anaden despues.' : product?.name}</p>
          </div>
          <button type="button" className="adm-btn adm-btn-sm" onClick={closeSafely} aria-label="Cerrar" disabled={busy}>
            &times;
          </button>
        </header>

        <div className="adm-modal-body">
          <div className="adm-field">
            <label htmlFor="p-name">Nombre</label>
            <input id="p-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Camisa de lino" disabled={busy} autoFocus />
          </div>

          <div className="adm-row2">
            <div className="adm-field">
              <label htmlFor="p-price">Precio base</label>
              <input id="p-price" type="number" step="0.01" min="0.01" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} placeholder="499.00" disabled={busy} />
              <span className="adm-hint">Las tallas pueden llevar un precio propio.</span>
            </div>
            <div className="adm-field">
              <label htmlFor="p-published">Visibilidad</label>
              <select id="p-published" value={published ? 'yes' : 'no'} onChange={(e) => setPublished(e.target.value === 'yes')} disabled={busy}>
                <option value="no">Borrador (oculto en la tienda)</option>
                <option value="yes">Publicado (visible y comprable)</option>
              </select>
            </div>
          </div>

          <div className="adm-field">
            <label htmlFor="p-desc">Descripcion</label>
            <textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Algodon organico, corte holgado, disponible en tres colores..." disabled={busy} />
          </div>

          <div className="adm-field">
            <label>Fotos{totalPhotos > 0 && <span className="adm-hint"> · {totalPhotos} de {MAX_PHOTOS}</span>}</label>

            {photos.length > 0 && (
              <div className="adm-imgs">
                {photos.map((img, index) => (
                  <figure className="adm-img" key={img.id} data-busy={busyImage === img.id || undefined}>
                    <img src={img.url} alt={img.altText || product?.name || ''} />
                    {index === 0 && <span className="adm-img-cover">Portada</span>}
                    <div className="adm-img-tools">
                      <button type="button" onClick={() => moveImage(index, index - 1)} disabled={busy || index === 0} aria-label="Mover la foto antes">&larr;</button>
                      <button type="button" onClick={() => moveImage(index, index + 1)} disabled={busy || index === photos.length - 1} aria-label="Mover la foto despues">&rarr;</button>
                      <button type="button" onClick={() => setPendingDelete(img.id)} disabled={busy} aria-label={`Quitar foto de ${product?.name ?? ''}`}>&times;</button>
                    </div>
                    <figcaption>
                      {editingAlt?.id === img.id ? (
                        <span className="adm-img-alt">
                          <input
                            value={editingAlt.value}
                            onChange={(e) => setEditingAlt({ id: img.id, value: e.target.value })}
                            placeholder="Texto alternativo"
                            maxLength={200}
                            autoFocus
                          />
                          <button type="button" onClick={() => saveAlt(img)} disabled={busy}>Guardar</button>
                          <button type="button" onClick={() => setEditingAlt(null)} disabled={busy}>Cancelar</button>
                        </span>
                      ) : (
                        <button type="button" className="adm-img-alt-edit" onClick={() => setEditingAlt({ id: img.id, value: img.altText })} disabled={busy}>
                          {img.altText ? img.altText : <em>Anadir texto alternativo</em>}
                        </button>
                      )}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}

            {pending.length > 0 && (
              <div className="adm-imgs">
                {pending.map((item, index) => (
                  <figure className="adm-img" key={item.key} data-pending="true">
                    <img src={item.preview} alt="Vista previa" />
                    {uploading && index === progress?.index && <span className="adm-img-cover">{progress.percent === null ? 'Subiendo' : `${progress.percent}%`}</span>}
                    <button type="button" onClick={() => discardPending(item.key)} aria-label="Quitar la foto seleccionada" disabled={uploading}>&times;</button>
                  </figure>
                ))}
              </div>
            )}

            <div
              className="adm-drop"
              data-over={dragOver || undefined}
              onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files)); }}
            >
              <button type="button" onClick={() => fileInput.current?.click()} disabled={busy || totalPhotos >= MAX_PHOTOS} style={{ all: 'unset', cursor: busy ? 'not-allowed' : 'pointer', textAlign: 'center' }}>
                <span style={{ fontSize: 22 }}>📷</span>
                <b>{totalPhotos >= MAX_PHOTOS ? 'Galeria completa' : 'Arrastra aqui o pulsa para elegir fotos'}</b>
                <span>JPG, PNG o WebP · hasta 5 MB cada una · maximo {MAX_PHOTOS}</span>
              </button>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => addFiles(Array.from(e.target.files ?? []))} />
            </div>

            {uploading && progress && (
              <div className="adm-progress" role="status" aria-live="polite">
                <div className="adm-progress-bar">
                  <div className="adm-progress-fill" style={{ width: `${Math.max(2, progressoTotal)}%` }} />
                </div>
                <span className="adm-hint">
                  Subiendo foto {progress.index + 1} de {progress.total}
                  {progress.percent !== null ? ` · ${progress.percent}%` : ' · calculando…'}
                </span>
              </div>
            )}

            {pending.length > 0 && !uploading && <span className="adm-hint">Las {pending.length} {pending.length === 1 ? 'foto se subira' : 'fotos se subirán'} al guardar el producto.</span>}
          </div>

          {product && <VariantsEditor token={token} productId={product.id} productName={product.name} variants={product.variants} onChanged={onChanged} />}
        </div>

        <footer className="adm-modal-foot">
          <button type="button" className="adm-btn" onClick={closeSafely} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="adm-btn adm-btn-primary" onClick={submit} disabled={busy}>
            {uploading ? 'Subiendo fotos…' : saving ? 'Guardando…' : isNew ? 'Crear producto' : 'Guardar cambios'}
          </button>
        </footer>

        {saving && !uploading && (
          <div className="adm-busy" role="status" aria-live="assertive">
            <div className="adm-busy-card">
              <span className="adm-spinner" aria-hidden="true" />
              <strong>Guardando el producto…</strong>
              <span className="adm-hint">Un momento, no cierres esta ventana.</span>
            </div>
          </div>
        )}
      </div>

      <Confirm
        open={pendingDelete !== null}
        title="Quitar esta foto"
        body="La foto se borrara del producto y del servidor. No se puede deshacer."
        confirmLabel="Si, quitar"
        danger
        onConfirm={() => removeImage(pendingDelete!)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}