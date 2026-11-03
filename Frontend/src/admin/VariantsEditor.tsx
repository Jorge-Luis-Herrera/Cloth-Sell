import { useEffect, useState } from 'react';
import { SUGGESTED_COLORS, SUGGESTED_SIZES, api, type Variant, type VariantInput } from '../api';
import { money, useToast } from './ui';

type Draft = VariantInput & { id?: string; key: string };

let keySeq = 0;
const key = () => `draft-${++keySeq}`;

const blank = (): Draft => ({ key: key(), size: '', color: '', sku: '', priceOverride: null, isActive: true });

const toDraft = (v: Variant): Draft => ({
  key: `saved-${v.id}`,
  id: v.id,
  size: v.size,
  color: v.color,
  sku: v.sku ?? '',
  priceOverride: v.priceOverride ?? null,
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
  const [selectedSizes, setSelectedSizes] = useState<string[]>(['S', 'M', 'L']);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);

  useEffect(() => {
    setDrafts(variants.map(toDraft));
  }, [variants]);

  const replace = (key: string, patch: Partial<Draft>) => setDrafts((d) => d.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const add = () => setDrafts((d) => [...d, blank()]);

  const toggle = (value: string, selected: string[], setSelected: (values: string[]) => void) => {
    setSelected(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  };

  const generate = () => {
    if (selectedSizes.length === 0 || selectedColors.length === 0) {
      toast.error('Selecciona al menos una talla y un color.');
      return;
    }
    setDrafts((current) => {
      const existing = new Set(current.map((row) => `${row.size.trim().toLowerCase()}\u0000${row.color.trim().toLowerCase()}`));
      const generated = selectedSizes.flatMap((size) => selectedColors.flatMap((color) => {
        const combination = `${size.toLowerCase()}\u0000${color.toLowerCase()}`;
        if (existing.has(combination)) return [];
        existing.add(combination);
        return [{ ...blank(), size, color }];
      }));
      return [...current, ...generated];
    });
    toast.success('Combinaciones añadidas. Revisa las filas y pulsa Guardar.');
  };

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

  const saveNew = async () => {
    const nuevos = drafts.filter((row) => !row.id);
    if (nuevos.length === 0) {
      toast.error('No hay variantes nuevas para guardar.');
      return;
    }
    if (nuevos.some((row) => !row.size.trim() || !row.color.trim())) {
      toast.error('Completa la talla y el color de todas las variantes nuevas.');
      return;
    }
    setBusyId('bulk');
    let guardadas = 0;
    try {
      for (const row of nuevos) {
        const result = await api.saveVariant(token, productId, {
          size: row.size.trim(),
          color: row.color.trim(),
          sku: row.sku?.trim() || null,
          priceOverride: row.priceOverride === null || Number.isNaN(row.priceOverride) ? null : Number(row.priceOverride),
          isActive: row.isActive,
        }) as { id?: string } | null;
        if (result?.id) {
          setDrafts((current) => current.map((item) => item.key === row.key ? { ...item, id: result.id, key: `saved-${result.id}` } : item));
        }
        guardadas += 1;
      }
      await onChanged();
      toast.success(`${guardadas} ${guardadas === 1 ? 'variante guardada' : 'variantes guardadas'}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Se guardaron ${guardadas} variantes; revisa las restantes.`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="adm-variants">
      <header className="adm-variants-head">
        <div>
          <h3>Tallas y colores</h3>
          <p className="adm-hint">Genera combinaciones y revisa sus precios antes de guardarlas.</p>
        </div>
        <button type="button" className="adm-btn adm-btn-sm" onClick={add}>
          + Añadir variante
        </button>
      </header>

      <div className="adm-variant-picker">
        <fieldset>
          <legend>Tallas</legend>
          <div className="adm-checks">
            {['S', 'M', 'L'].map((size) => (
              <label key={size}>
                <input type="checkbox" checked={selectedSizes.includes(size)} onChange={() => toggle(size, selectedSizes, setSelectedSizes)} />
                {size}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Colores</legend>
          <div className="adm-checks">
            {SUGGESTED_COLORS.map((color) => (
              <label key={color}>
                <input type="checkbox" checked={selectedColors.includes(color)} onChange={() => toggle(color, selectedColors, setSelectedColors)} />
                {color}
              </label>
            ))}
          </div>
        </fieldset>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="adm-btn" onClick={generate} disabled={busyId !== null}>
            Generar {selectedSizes.length * selectedColors.length} combinaciones
          </button>
          <button type="button" className="adm-btn adm-btn-primary" onClick={() => void saveNew()} disabled={busyId !== null || !drafts.some((row) => !row.id)}>
            Guardar nuevas ({drafts.filter((row) => !row.id).length})
          </button>
        </div>
      </div>

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
            <button type="button" className="adm-btn adm-btn-sm adm-btn-primary" onClick={() => save(row)} disabled={busyId !== null || busyId === (row.id ?? 'new')}>
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
          {drafts.length} {drafts.length === 1 ? 'variante' : 'variantes'}
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