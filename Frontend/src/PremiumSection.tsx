import { useEffect, useRef, useState } from 'react';
import { Product, STORE_CURRENCY, STORE_LOCALE } from './api';

const money = (value: number) => new Intl.NumberFormat(STORE_LOCALE, { style: 'currency', currency: STORE_CURRENCY }).format(value);

/** Linea tecnica de la prenda activa. Solo con los datos que existen: si no hay ficha, no se
 *  inventa nada y la linea desaparece. */
function lineaTecnica(product: Product) {
  const ficha = product.premium;
  if (!ficha) return '';
  const composicion = ficha.composition.length > 0
    ? ficha.composition.map((parte) => `${parte.fiber} ${parte.percent} %`).join(' · ')
    : null;
  return [
    composicion,
    ficha.fabricWeightGsm ? `${ficha.fabricWeightGsm} g/m²` : null,
    ficha.origin || null,
  ].filter(Boolean).join(' · ');
}

/**
 * Serie premium: una prenda destacada a lo grande, con el texto encima de la foto, y debajo
 * una tira de miniaturas que se desliza de lado. Tocar una miniatura (o las flechas) cambia
 * el destacado. La ficha tecnica completa sigue en la hoja de producto.
 */
export function PremiumSection({ items, onOpen }: { items: Product[]; onOpen: (product: Product) => void }) {
  const [activo, setActivo] = useState(0);
  const tira = useRef<HTMLDivElement>(null);
  const indice = items.length > 0 ? Math.min(activo, items.length - 1) : 0;
  const producto = items[indice];

  // Al cambiar de prenda, la miniatura activa se centra sola en la tira (sin mover la pagina).
  useEffect(() => {
    const contenedor = tira.current;
    const miniatura = contenedor?.children[indice] as HTMLElement | undefined;
    miniatura?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [indice]);

  if (!producto) return null;

  const foto = producto.images[0];
  const ficha = producto.premium;
  const datos = lineaTecnica(producto);
  const mover = (paso: number) => setActivo((actual) => (actual + paso + items.length) % items.length);

  return (
    <section id="premium" className="premium" aria-label="Serie premium">
      <div className="premium-head">
        <div>
          <p className="eyebrow">SERIE PREMIUM · EDICIÓN LIMITADA</p>
          <p className="premium-lede">Pocas prendas, elegidas una a una.</p>
        </div>
        {items.length > 1 && (
          <div className="premium-arrows">
            <button type="button" className="premium-arrow" onClick={() => mover(-1)} aria-label="Prenda anterior">←</button>
            <button type="button" className="premium-arrow" onClick={() => mover(1)} aria-label="Prenda siguiente">→</button>
          </div>
        )}
      </div>

      <div className="premium-stage">
        {foto
          ? <img key={producto.id} className="premium-stage-img" src={foto.url} alt={foto.altText || producto.name} loading="lazy" decoding="async" />
          : <span className="premium-stage-initial" aria-hidden="true">{producto.name.slice(0, 1)}</span>}
        <span className="premium-index" aria-hidden="true">{String(indice + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</span>
        <div className="premium-copy" aria-live="polite">
          <p className="premium-kicker">¿Buscas una prenda que dure?</p>
          <h2 className="premium-title">{producto.name}</h2>
          <p className="premium-sub">{ficha?.tagline || 'Edición limitada'}</p>
        </div>
        <div className="premium-foot">
          {datos && <span className="premium-specs">{datos}</span>}
          <span className="premium-price">{money(producto.basePrice)}</span>
          <button type="button" className="premium-cta" onClick={() => onOpen(producto)}>Ver ficha <span aria-hidden="true">→</span></button>
        </div>
      </div>

      {items.length > 1 && (
        <div className="premium-rail" ref={tira} aria-label="Prendas de la serie premium">
          {items.map((item, i) => {
            const miniatura = item.images[0];
            return (
              <button
                type="button"
                key={item.id}
                className="premium-thumb"
                data-active={i === indice || undefined}
                aria-current={i === indice ? 'true' : undefined}
                aria-label={item.name}
                onClick={() => setActivo(i)}
              >
                {miniatura
                  ? <img src={miniatura.url} alt="" loading="lazy" decoding="async" />
                  : <span className="premium-thumb-initial" aria-hidden="true">{item.name.slice(0, 1)}</span>}
                <span className="premium-thumb-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
