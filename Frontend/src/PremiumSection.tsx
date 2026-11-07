import { useEffect, useRef, useState } from 'react';
import { Product, STORE_CURRENCY, STORE_LOCALE } from './api';

const money = (value: number) => new Intl.NumberFormat(STORE_LOCALE, { style: 'currency', currency: STORE_CURRENCY }).format(value);

/** Fondo fijo de la serie premium (no cambia al tocar: siempre la misma foto). */
const FONDO_PREMIUM = '/media/premium/bg-premium.png';

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
 * Serie premium al estilo de la referencia (Estilo_de_Premium.jpeg): fondo fijo, oscurecido,
 * con el nombre del activo en el centro y debajo una fila de hasta 4 producticos limpios que
 * ocupa el ancho. Tocar un productico elige la prenda y actualiza las letras y los datos de
 * abajo; con mas de 4 prendas la fila se desliza de lado para pasar por todas. La ficha
 * completa sigue en la hoja de producto.
 */
export function PremiumSection({ items, onOpen }: { items: Product[]; onOpen: (product: Product) => void }) {
  const [activo, setActivo] = useState(0);
  const [indicador, setIndicador] = useState({ left: 0, width: 100 });
  const tira = useRef<HTMLDivElement>(null);
  const indice = items.length > 0 ? Math.min(activo, items.length - 1) : 0;
  const producto = items[indice];

  const medirIndicador = () => {
    const tiraEl = tira.current;
    if (!tiraEl) return;
    const maxScroll = tiraEl.scrollWidth - tiraEl.clientWidth;
    if (maxScroll <= 0) {
      setIndicador({ left: 0, width: 100 });
      return;
    }
    const width = Math.max(18, (tiraEl.clientWidth / tiraEl.scrollWidth) * 100);
    const left = (tiraEl.scrollLeft / maxScroll) * (100 - width);
    setIndicador({ left, width });
  };

  useEffect(() => {
    medirIndicador();
    window.addEventListener('resize', medirIndicador);
    return () => window.removeEventListener('resize', medirIndicador);
  }, [items.length]);

  if (!producto) return null;

  const ficha = producto.premium;
  const datos = lineaTecnica(producto);

  return (
    <section id="premium" className="premium" aria-label="Serie premium">
      <div className="premium-head">
        <div>
          <p className="eyebrow">SERIE PREMIUM · EDICIÓN LIMITADA</p>
        </div>
      </div>

      <div className="premium-stage">
        <img className="premium-stage-img" src={FONDO_PREMIUM} alt="" aria-hidden="true" loading="eager" decoding="async" />

        <div className="premium-copy" aria-live="polite">
          <p className="premium-kicker">¿Buscas una prenda exclusiva?</p>
          <h2 className="premium-title">{producto.name}</h2>
          <p className="premium-sub">{ficha?.tagline || 'Edición limitada'}</p>
        </div>

        {/* Producticos limpios (sin texto) en el centro de la foto: con mas de 4, la tira
            entera se desliza de lado y lleva su minibarra de scroll debajo. */}
        <div className="premium-grid" ref={tira} onScroll={medirIndicador} aria-roledescription="carrusel" aria-label="Prendas de la serie premium">
          {items.map((item, i) => (
            <button
              type="button"
              key={item.id}
              className="premium-card"
              aria-label={`Ver ${item.name} como prenda destacada`}
              onClick={() => {
                if (window.matchMedia('(max-width: 820px)').matches) onOpen(item);
                else setActivo(i);
              }}
            >
              {item.images[0]
                ? <img src={item.images[0].url} alt="" loading="lazy" decoding="async" />
                : <span className="premium-card-initial" aria-hidden="true">{item.name.slice(0, 1)}</span>}
            </button>
          ))}
        </div>
        <div className="premium-scrollbar" role="scrollbar" aria-label="Posición en la serie premium" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(indicador.left / Math.max(1, 100 - indicador.width) * 100)}>
          <span className="premium-scrollbar-thumb" style={{ left: `${indicador.left}%`, width: `${indicador.width}%` }} />
        </div>

        <div className="premium-foot">
          {datos && <span className="premium-specs">{datos}</span>}
          <span className="premium-price">{money(producto.basePrice)}</span>
          <button type="button" className="premium-cta" onClick={() => onOpen(producto)}>Ver ficha <span aria-hidden="true">→</span></button>
        </div>
      </div>
    </section>
  );
}
