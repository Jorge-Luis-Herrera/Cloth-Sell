import { useEffect, useRef, useState } from 'react';
import { api, type PremiumInput, type Product, type ProductImage, type ProductInput } from '../api';
import { Confirm, useToast } from './ui';
import { VariantsEditor } from './VariantsEditor';

const MAX_UPLOAD = 5 * 1024 * 1024;
const MAX_PHOTOS = 30;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

/** Fila de composicion en edicion: el porcentaje se guarda como texto para no pelear con
 *  el input mientras se escribe ("9" antes de "92"). Se convierte al guardar. */
type FibraEdit = { fiber: string; percent: string };
type EnsayoEdit = { name: string; method: string; result: string };

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

  // Ficha premium: solo se envia si la casilla esta marcada. Los campos vacios se guardan
  // vacios y la tienda simplemente no pinta esa fila (no se rellenan con datos inventados).
  const [isPremium, setIsPremium] = useState(false);
  const [premiumRank, setPremiumRank] = useState('');
  const [tagline, setTagline] = useState('');
  const [origin, setOrigin] = useState('');
  const [gsm, setGsm] = useState('');
  const [limitedUnits, setLimitedUnits] = useState('');
  const [story, setStory] = useState('');
  const [composition, setComposition] = useState<FibraEdit[]>([]);
  const [care, setCare] = useState('');
  const [tests, setTests] = useState<EnsayoEdit[]>([]);

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
    setIsPremium(Boolean(product.isPremium));
    setPremiumRank(product.premiumRank != null ? String(product.premiumRank) : '');
    const ficha = product.premium;
    setTagline(ficha?.tagline ?? '');
    setOrigin(ficha?.origin ?? '');
    setGsm(ficha?.fabricWeightGsm != null ? String(ficha.fabricWeightGsm) : '');
    setLimitedUnits(ficha?.limitedUnits != null ? String(ficha.limitedUnits) : '');
    setStory(ficha?.story ?? '');
    setComposition((ficha?.composition ?? []).map((fibra) => ({ fiber: fibra.fiber, percent: String(fibra.percent) })));
    setCare((ficha?.care ?? []).join('\n'));
    setTests((ficha?.tests ?? []).map((ensayo) => ({ ...ensayo })));
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

    // La ficha se valida aqui para dar un mensaje concreto; el backend repite la validacion.
    const rank = premiumRank.trim() ? Number(premiumRank) : null;
    if (rank !== null && (!Number.isInteger(rank) || rank < 0)) return toast.error('El orden en la serie debe ser un número entero.');

    let premium: PremiumInput | null = null;
    if (isPremium) {
      const fibras = composition
        .map((fibra) => ({ fiber: fibra.fiber.trim(), percent: Number(fibra.percent) }))
        .filter((fibra) => fibra.fiber);
      if (fibras.some((fibra) => !Number.isFinite(fibra.percent) || fibra.percent < 0 || fibra.percent > 100)) return toast.error('Cada fibra debe estar entre 0 y 100 %.');
      const total = fibras.reduce((suma, fibra) => suma + fibra.percent, 0);
      if (fibras.length > 0 && total !== 100) return toast.error(`La composición debe sumar 100 % (ahora suma ${total} %).`);
      const gramaje = gsm.trim() ? Number(gsm) : null;
      if (gramaje !== null && (!Number.isFinite(gramaje) || gramaje <= 0)) return toast.error('El gramaje debe ser mayor que cero.');
      const tirada = limitedUnits.trim() ? Number(limitedUnits) : null;
      if (tirada !== null && (!Number.isInteger(tirada) || tirada < 0)) return toast.error('Las unidades de la tirada no pueden ser negativas.');
      premium = {
        tagline: tagline.trim(),
        composition: fibras,
        fabricWeightGsm: gramaje,
        origin: origin.trim(),
        care: care.split('\n').map((linea) => linea.trim()).filter(Boolean),
        tests: tests.map((ensayo) => ({ name: ensayo.name.trim(), method: ensayo.method.trim(), result: ensayo.result.trim() })).filter((ensayo) => ensayo.name),
        story: story.trim(),
        limitedUnits: tirada,
      };
    }

    setSaving(true);
    try {
      const payload: ProductInput = { name: name.trim(), description: description.trim(), basePrice: price, published, isPremium, premiumRank: rank, premium };
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
  const totalFibras = composition.reduce((suma, fibra) => suma + (Number(fibra.percent) || 0), 0);

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

          <div className="adm-premium" data-on={isPremium || undefined}>
            <label className="adm-premium-toggle">
              <input type="checkbox" checked={isPremium} onChange={(e) => setIsPremium(e.target.checked)} disabled={busy} />
              <span>
                <b>Producto premium</b>
                <span className="adm-hint">Sale en la serie premium, antes del catálogo, con su ficha técnica.</span>
              </span>
            </label>

            {isPremium && (
              <div className="adm-premium-body">
                <div className="adm-row2">
                  <div className="adm-field">
                    <label htmlFor="p-rank">Orden en la serie</label>
                    <input id="p-rank" type="number" min="0" step="1" value={premiumRank} onChange={(e) => setPremiumRank(e.target.value)} placeholder="1" disabled={busy} />
                    <span className="adm-hint">Menor número, antes sale. Vacío = al final.</span>
                  </div>
                  <div className="adm-field">
                    <label htmlFor="p-tagline">Frase de la ficha</label>
                    <input id="p-tagline" type="text" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Lino europeo tejido en Portugal" maxLength={120} disabled={busy} />
                  </div>
                </div>

                <div className="adm-field">
                  <label>Composición <span className="adm-hint">· {totalFibras} %</span></label>
                  {composition.map((fibra, index) => (
                    <div className="adm-prow" key={index}>
                      <input
                        value={fibra.fiber}
                        onChange={(e) => setComposition(composition.map((actual, i) => (i === index ? { ...actual, fiber: e.target.value } : actual)))}
                        placeholder="Algodón"
                        aria-label={`Fibra ${index + 1}`}
                        disabled={busy}
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={fibra.percent}
                        onChange={(e) => setComposition(composition.map((actual, i) => (i === index ? { ...actual, percent: e.target.value } : actual)))}
                        placeholder="%"
                        aria-label={`Porcentaje de la fibra ${index + 1}`}
                        disabled={busy}
                      />
                      <button type="button" className="adm-prow-x" onClick={() => setComposition(composition.filter((_, i) => i !== index))} aria-label="Quitar fibra" disabled={busy}>&times;</button>
                    </div>
                  ))}
                  <button type="button" className="adm-btn adm-btn-sm" onClick={() => setComposition([...composition, { fiber: '', percent: '' }])} disabled={busy}>Añadir fibra</button>
                  <span className="adm-hint">Debe sumar 100 %. Se pinta como barra de composición.</span>
                </div>

                <div className="adm-row2">
                  <div className="adm-field">
                    <label htmlFor="p-gsm">Gramaje (g/m²)</label>
                    <input id="p-gsm" type="number" min="1" step="1" value={gsm} onChange={(e) => setGsm(e.target.value)} placeholder="240" disabled={busy} />
                  </div>
                  <div className="adm-field">
                    <label htmlFor="p-units">Tirada (unidades)</label>
                    <input id="p-units" type="number" min="0" step="1" value={limitedUnits} onChange={(e) => setLimitedUnits(e.target.value)} placeholder="40" disabled={busy} />
                  </div>
                </div>

                <div className="adm-field">
                  <label htmlFor="p-origin">Origen</label>
                  <input id="p-origin" type="text" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Tejido en Portugal · confeccionado en España" maxLength={160} disabled={busy} />
                </div>

                <div className="adm-field">
                  <label htmlFor="p-care">Cuidados</label>
                  <textarea id="p-care" value={care} onChange={(e) => setCare(e.target.value)} placeholder={'Lavar a 30 °C\nNo usar secadora'} rows={3} disabled={busy} />
                  <span className="adm-hint">Uno por línea.</span>
                </div>

                <div className="adm-field">
                  <label>Ensayos</label>
                  {tests.map((ensayo, index) => (
                    <div className="adm-prow adm-prow-3" key={index}>
                      <input
                        value={ensayo.name}
                        onChange={(e) => setTests(tests.map((actual, i) => (i === index ? { ...actual, name: e.target.value } : actual)))}
                        placeholder="Solidez del color"
                        aria-label={`Ensayo ${index + 1}`}
                        disabled={busy}
                      />
                      <input
                        value={ensayo.method}
                        onChange={(e) => setTests(tests.map((actual, i) => (i === index ? { ...actual, method: e.target.value } : actual)))}
                        placeholder="UNE-EN ISO 105-C06"
                        aria-label={`Norma del ensayo ${index + 1}`}
                        disabled={busy}
                      />
                      <input
                        value={ensayo.result}
                        onChange={(e) => setTests(tests.map((actual, i) => (i === index ? { ...actual, result: e.target.value } : actual)))}
                        placeholder="4-5"
                        aria-label={`Resultado del ensayo ${index + 1}`}
                        disabled={busy}
                      />
                      <button type="button" className="adm-prow-x" onClick={() => setTests(tests.filter((_, i) => i !== index))} aria-label="Quitar ensayo" disabled={busy}>&times;</button>
                    </div>
                  ))}
                  <button type="button" className="adm-btn adm-btn-sm" onClick={() => setTests([...tests, { name: '', method: '', result: '' }])} disabled={busy}>Añadir ensayo</button>
                  <span className="adm-hint">Solo con el informe del proveedor: nombre, norma y resultado.</span>
                </div>

                <div className="adm-field">
                  <label htmlFor="p-story">Historia de la prenda</label>
                  <textarea id="p-story" value={story} onChange={(e) => setStory(e.target.value)} placeholder="Por qué esta prenda está en la serie premium..." disabled={busy} />
                </div>
              </div>
            )}
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