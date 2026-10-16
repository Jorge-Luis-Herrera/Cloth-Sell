import { useState } from 'react';
import { SUGGESTED_COLORS, SUGGESTED_SIZES, api, type Variant, type VariantInput } from '../api';
import { money, useToast } from './ui';

type Draft = VariantInput & { id?: string; key: string };

let keySeq = 0;
const key = () => `draft-${++keySeq}`;

const blank = (): Draft => ({ key: key(), size: '', color: '', sku: '', priceOverride: null, stockQuantity: 0, isActive: true });

const toDraft = (v: Variant): Draft => ({
  key: `saved-${v.id}`,
  id: v.id,
  size: v.size,
  color: v.color,
  sku: v.sku ?? '',
  priceOverride: v.priceOverride ?? null,
  stockQuantity: v.stockQuantity,
  isActive: v.isActive,
});

/**
 * Editor de tallas y colores. Cada fila se guarda contra el backend de forma
 * independiente, porque el API expone una variante por fila y no un guardado
 * masivo: si una fila falla, las demas ya estan a salvo.
 */
export function VariantsEditor({ token, productId, productName, variants, onChanged }: { token: string; productId: string; productName: string; variants: Variant[]; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const [drafts, setDrafts] = useState<Draft[]>(variants.map(toDraft));
  const [busyId, setBusyId] = useState<string | null>(null);

  const replace = (key: string, patch: Partial<Draft>) => setDrafts((d) => d.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const add = () => setDrafts((d) => [...d, blank()]);

  const remove = async (row: Draft) => {
    if (!row.id) {
      setDrafts((d) => d.filter((x) => x.key !== row.key));
      return;
    }
    setBusyId(row.id);
    try {
      await api.deleteVariant(token, productId, row.id);
      await onChanged();
      setDrafts((d) => d.filter((x) => x.key !== row.key));
      toast.success('Variante eliminada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar la variante.');
    } finally {
      setBusyId(null);
    }
  };

  const save = async (row: Draft) => {
    if (!row.size.trim() || !row.color.trim()) {
      toast.error('La talla y el color son obligatorios.');
      return;
    }
    setBusyId(row.id ?? 'new');
    const payload: VariantInput = {
      size: row.size.trim(),
      color: row.color.trim(),
      sku: row.sku?.trim() || null,
      priceOverride: row.priceOverride === null || Number.isNaN(row.priceOverride) ? null : Number(row.priceOverride),
      stockQuantity: Number(row.stockQuantity) || 0,
      isActive: row.isActive,
    };
    try {
      if (row.id) await api.updateVariant(token, productId, row.id, payload);
      else await api.saveVariant(token, productId, payload);
      await onChanged();
      toast.success(row.id ? 'Variante actualizada.' : 'Variante añadida.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar la variante.');
    } finally {
      setBusyId(null);
    }
  };

  const totalStock = drafts.reduce((sum, d) => sum + (Number(d.stockQuantity) || 0), 0);

  return (
    <section className="adm-variants">
      <header className="adm-variants-head">
        <div>
          <h3>Tallas y colores</h3>
          <p className="adm-hint">Sin tallas, el producto no se puede comprar.</p>
        </div>
        <button type="button" className="adm-btn adm-btn-sm" onClick={add}>
          + Añadir talla
        </button>
      </header>

      {drafts.length === 0 && (
        <p className="adm-hint" style={{ padding: '18px 16px' }}>
          Todavia no hay tallas para {productName}. Añade al menos una para que se pueda comprar.
        </p>
      )}

      {drafts.map((row, index) => (
        <div className="adm-vrow" key={row.key}>
          <div>
            <label className="adm-hint" htmlFor={`size-${index}`}>
              Talla
            </label>
            <input
              id={`size-${index}`}
              list="jenny-sizes"
              value={row.size}
              onChange={(e) => replace(row.key, { size: e.target.value })}
              placeholder="M"
            />
          </div>
          <div>
            <label className="adm-hint" htmlFor={`color-${index}`}>
              Color
            </label>
            <input
              id={`color-${index}`}
              list="jenny-colors"
              value={row.color}
              onChange={(e) => replace(row.key, { color: e.target.value })}
              placeholder="Negro"
            />
          </div>
          <div>
            <label className="adm-hint" htmlFor={`stock-${index}`}>
              Existencias
            </label>
            <input
              id={`stock-${index}`}
              type="number"
              min={0}
              value={row.stockQuantity}
              onChange={(e) => replace(row.key, { stockQuantity: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="adm-hint" htmlFor={`price-${index}`}>
              Precio extra
            </label>
            <input
              id={`price-${index}`}
              type="number"
              step="0.01"
              min={0}
              value={row.priceOverride ?? ''}
              placeholder="Igual al base"
              onChange={(e) => replace(row.key, { priceOverride: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="adm-btn adm-btn-sm adm-btn-primary" onClick={() => save(row)} disabled={busyId === (row.id ?? 'new')}>
              Guardar
            </button>
            <button type="button" className="adm-btn adm-btn-sm" onClick={() => remove(row)} disabled={busyId === row.id}>
              &times;
            </button>
          </div>
        </div>
      ))}

      <footer className="adm-vfoot">
        <span>
          {drafts.length} {drafts.length === 1 ? 'talla' : 'tallas'} · {totalStock} unidades en total
        </span>
        {drafts.some((d) => Number(d.priceOverride) > 0) && <span>Con precio extra: {money(Math.max(...drafts.map((d) => Number(d.priceOverride) || 0)))}</span>}
      </footer>

      <datalist id="jenny-sizes">
        {SUGGESTED_SIZES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="jenny-colors">
        {SUGGESTED_COLORS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </section>
  );
}