import { useEffect, useRef, useState } from 'react';
import { api, type Product } from '../api';
import { Confirm, useToast } from './ui';
import { VariantsEditor } from './VariantsEditor';

const MAX_UPLOAD = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export function ProductDialog({ token, product, onClose, onChanged }: { token: string; product: Product | null; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const isNew = product === null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // Foto elegida antes de que el producto exista. El endpoint de subida necesita un
  // id de producto, asi que en alta se envia en cuanto createProduct devuelve el id.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const busy = saving || uploading;

  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setDescription(product.description ?? '');
    setBasePrice(String(product.basePrice ?? ''));
    setPublished(Boolean(product.published));
  }, [product]);

  // Libera el object URL de la vista previa para no filtrar memoria.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  // Mientras se guarda o se sube, cerrar el dialogo dejaria el proceso a medias y
  // el usuario podria abrir otro y crear un producto duplicado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy && !pendingDelete) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pendingDelete, busy]);

  const chooseFile = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error('Solo se admiten imagenes JPG, PNG o WebP.');
      return;
    }
    if (file.size > MAX_UPLOAD) {
      toast.error('La imagen supera el limite de 5 MB.');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setPendingFile(file);
    setPreview(URL.createObjectURL(file));
    if (fileInput.current) fileInput.current.value = '';
  };

  const discardPending = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPendingFile(null);
    setPreview(null);
  };

  const uploadFor = async (productId: string, file: File, alt: string) => {
    setUploading(true);
    await api.uploadImage(token, productId, file, alt);
    await onChanged();
  };

  const pickImage = async (file: File | undefined) => {
    if (!file || !product) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error('Solo se admiten imagenes JPG, PNG o WebP.');
      return;
    }
    if (file.size > MAX_UPLOAD) {
      toast.error('La imagen supera el limite de 5 MB.');
      return;
    }
    try {
      await uploadFor(product.id, file, name || product.name);
      toast.success('Foto subida.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo subir la foto.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removeImage = async (imageId: string) => {
    if (!product) return;
    try {
      await api.deleteImage(token, product.id, imageId);
      await onChanged();
      toast.success('Foto eliminada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar la foto.');
    } finally {
      setPendingDelete(null);
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
        if (pendingFile) await uploadFor(product.id, pendingFile, name.trim() || product.name);
        toast.success('Cambios guardados.');
      } else {
        const created = await api.createProduct(token, payload);
        if (pendingFile) await uploadFor(created.id, pendingFile, name.trim());
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

  return (
    <div className="adm-modal-wrap" onClick={closeSafely} role="presentation">
      <div className="adm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={isNew ? 'Nuevo producto' : 'Editar producto'}>
        <header className="adm-modal-head">
          <div>
            <h2>{isNew ? 'Nuevo producto' : 'Editar producto'}</h2>
            <p>{isNew ? 'Nombre, precio y foto. Las tallas se anaden despues.' : product?.name}</p>
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
            <label>Fotos</label>
            {product && product.images.length > 0 && (
              <div className="adm-imgs">
                {product.images.map((img) => (
                  <figure className="adm-img" key={img.id}>
                    <img src={img.url} alt={img.altText || product.name} />
                    <button type="button" onClick={() => setPendingDelete(img.id)} aria-label={`Quitar foto de ${product.name}`} disabled={busy}>
                      &times;
                    </button>
                  </figure>
                ))}
              </div>
            )}

            {preview && (
              <div className="adm-imgs">
                <figure className="adm-img">
                  <img src={preview} alt="Vista previa" />
                  <button type="button" onClick={discardPending} aria-label="Quitar la foto seleccionada" disabled={busy}>
                    &times;
                  </button>
                </figure>
              </div>
            )}

            <button type="button" className="adm-drop" onClick={() => fileInput.current?.click()} disabled={busy}>
              <span style={{ fontSize: 22 }}>📷</span>
              <b>{pendingFile ? 'Cambiar la foto seleccionada' : 'Seleccionar imagen'}</b>
              <span>JPG, PNG o WebP · maximo 5 MB</span>
            </button>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => chooseFile(e.target.files?.[0])} />
            {pendingFile && <span className="adm-hint">La foto se subira al guardar el producto.</span>}
          </div>

          {product && <VariantsEditor token={token} productId={product.id} productName={product.name} variants={product.variants} onChanged={onChanged} />}
        </div>

        <footer className="adm-modal-foot">
          <button type="button" className="adm-btn" onClick={closeSafely} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="adm-btn adm-btn-primary" onClick={submit} disabled={busy}>
            {busy ? (uploading ? 'Subiendo foto…' : 'Guardando…') : isNew ? 'Crear producto' : 'Guardar cambios'}
          </button>
        </footer>

        {busy && (
          <div className="adm-busy" role="status" aria-live="assertive">
            <div className="adm-busy-card">
              <span className="adm-spinner" aria-hidden="true" />
              <strong>{uploading ? 'Subiendo la foto…' : 'Guardando el producto…'}</strong>
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