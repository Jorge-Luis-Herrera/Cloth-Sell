import { useMemo, useState } from 'react';
import { api, type Product } from '../api';
import { Confirm, money, useToast } from './ui';

const stockOf = (p: Product) => p.variants.reduce((n, v) => n + (v.stockQuantity || 0), 0);
const colorsOf = (p: Product) => [...new Set(p.variants.map((v) => v.color))].slice(0, 5);
const sizesOf = (p: Product) => [...new Set(p.variants.map((v) => v.size))].sort();

export function ProductsTab({ token, products, onChanged, onCreate, onEdit, dialogOpen }: { token: string; products: Product[]; onChanged: () => Promise<void>; onCreate: () => void; onEdit: (p: Product) => void; dialogOpen: boolean }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'published' | 'drafts' | 'low'>('all');
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((p) => {
      if (filter === 'published' && !p.published) return false;
      if (filter === 'drafts' && p.published) return false;
      if (filter === 'low' && stockOf(p) > 3) return false;
      if (!term) return true;
      return `${p.name} ${p.description} ${p.variants.map((v) => `${v.size} ${v.color} ${v.sku ?? ''}`).join(' ')}`.toLowerCase().includes(term);
    });
  }, [products, search, filter]);

  const togglePublished = async (p: Product) => {
    try {
      await api.updateProduct(token, p.id, { name: p.name, description: p.description, basePrice: p.basePrice, published: !p.published });
      await onChanged();
      toast.success(p.published ? `"${p.name}" se ocultó de la tienda.` : `"${p.name}" ya está visible en la tienda.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar la visibilidad.');
    }
  };

  const destroy = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await api.deleteProduct(token, pendingDelete.id);
      await onChanged();
      toast.success(`"${pendingDelete.name}" se eliminó.`);
      setPendingDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar el producto.');
    } finally {
      setBusy(false);
    }
  };

  const counts = {
    all: products.length,
    published: products.filter((p) => p.published).length,
    drafts: products.filter((p) => !p.published).length,
    low: products.filter((p) => stockOf(p) <= 3).length,
  };

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Catálogo</h1>
          <p>Da de alta tus prendas, sus tallas y sus fotos. Solo lo publicado se vende.</p>
        </div>
        <div className="adm-tools">
          <button type="button" className="adm-btn adm-btn-primary" onClick={onCreate} disabled={dialogOpen}>
            + Nuevo producto
          </button>
        </div>
      </header>

      <div className="adm-filters">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, talla, color o SKU"
          aria-label="Buscar productos"
          style={{ flex: '1 1 260px', minWidth: 200, padding: '9px 13px', border: '1px solid var(--j-line)', background: '#fff', font: 'inherit', fontSize: 14 }}
        />
        {(
          [
            ['all', 'Todos'],
            ['published', 'Publicados'],
            ['drafts', 'Borradores'],
            ['low', 'Pocas existencias'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" className="adm-pill" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label} ({counts[key]})
          </button>
        ))}
      </div>

      <div className="adm-cards">
        {visible.length === 0 && (
          <div className="adm-empty">
            <h3>{products.length === 0 ? 'Aun no hay productos' : 'Nada coincide con la busqueda'}</h3>
            <p>
              {products.length === 0
                ? 'Crea tu primera prenda y publicala para que aparezca en la tienda.'
                : 'Prueba con otro nombre o cambia el filtro.'}
            </p>
          </div>
        )}

        {visible.map((p) => {
          const stock = stockOf(p);
          const sizes = sizesOf(p);
          return (
            <article className="adm-card" key={p.id}>
              <div className="adm-thumb">
                {p.images[0] ? <img src={p.images[0].url} alt={p.images[0].altText || p.name} /> : <span className="adm-thumb-empty">J</span>}
                <span className="adm-thumb-flag" data-on={p.published}>
                  {p.published ? 'Publicado' : 'Borrador'}
                </span>
                <span className="adm-thumb-stock" data-low={stock <= 3}>
                  {stock === 0 ? 'Sin stock' : `${stock} uds`}
                </span>
              </div>

              <div className="adm-card-body">
                <h3>{p.name}</h3>
                {p.description && <p>{p.description}</p>}

                {colorsOf(p).length > 0 && (
                  <div className="adm-swatches">
                    {colorsOf(p).map((c) => (
                      <span className="adm-swatch" key={c}>
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                {sizes.length > 0 && <p className="adm-hint" style={{ marginTop: 6 }}>Tallas: {sizes.join(' · ')}</p>}
                {p.variants.length === 0 && <p className="adm-hint" style={{ color: 'var(--j-red)', marginTop: 6 }}>Sin tallas: no se puede comprar.</p>}

                <div className="adm-card-meta">
                  <span className="adm-price">
                    {money(p.basePrice)}
                    {p.variants.some((v) => v.priceOverride != null) && <small> base</small>}
                  </span>
                  <span className="adm-hint">{p.variants.length} tallas</span>
                </div>

                <div className="adm-card-actions">
                  <button type="button" className="adm-btn adm-btn-sm" onClick={() => onEdit(p)}>
                    Editar
                  </button>
                  <button type="button" className="adm-btn adm-btn-sm" onClick={() => togglePublished(p)}>
                    {p.published ? 'Ocultar' : 'Publicar'}
                  </button>
                  <button type="button" className="adm-btn adm-btn-sm adm-btn-danger" onClick={() => setPendingDelete(p)}>
                    Borrar
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <Confirm
        open={pendingDelete !== null}
        title={`Eliminar "${pendingDelete?.name ?? ''}"`}
        body="Se borrara el producto con todas sus tallas y sus fotos. Los pedidos ya realizados no se ven afectados. Esta accion no se puede deshacer."
        summary={
          pendingDelete && (
            <>
              <strong>{pendingDelete.name}</strong>
              <br />
              {pendingDelete.variants.length} tallas · {stockOf(pendingDelete)} unidades · {pendingDelete.images.length} fotos
            </>
          )
        }
        confirmLabel="Si, eliminar"
        danger
        busy={busy}
        onConfirm={destroy}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}