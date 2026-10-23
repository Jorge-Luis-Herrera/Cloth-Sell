import type { ReactNode } from 'react';
import { Product, STORE_CURRENCY, STORE_LOCALE } from './api';

const money = (value: number) => new Intl.NumberFormat(STORE_LOCALE, { style: 'currency', currency: STORE_CURRENCY }).format(value);

/** Un dato de la ficha. Solo se pinta si existe: la seccion no inventa gramajes ni origenes. */
function Dato({ label, children }: { label: string; children: ReactNode }) {
  return <div className="premium-row"><dt>{label}</dt><dd>{children}</dd></div>;
}

function PremiumItem({ product, index, onOpen }: { product: Product; index: number; onOpen: (product: Product) => void }) {
  const ficha = product.premium;
  const photo = product.images[0];
  const composicion = ficha?.composition ?? [];
  const cuidados = ficha?.care ?? [];
  const ensayos = ficha?.tests ?? [];
  return (
    <li className="premium-item">
      <button type="button" className="premium-media" onClick={() => onOpen(product)} aria-label={`Abrir la ficha de ${product.name}`}>
        {photo
          ? <img src={photo.url} alt={photo.altText || product.name} loading="lazy" decoding="async" />
          : <span className="premium-initial" aria-hidden="true">{product.name.slice(0, 1)}</span>}
        <span className="premium-num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <span className="premium-stamp">Serie premium</span>
      </button>
      <div className="premium-body">
        <p className="premium-kicker">{ficha?.tagline || 'Edición limitada'}</p>
        <h3 className="premium-name">{product.name}</h3>
        {composicion.length > 0 && (
          <div className="premium-fibers" aria-hidden="true">
            {composicion.map((parte, i) => <span key={`${parte.fiber}-${i}`} data-i={i % 5} style={{ width: `${parte.percent}%` }} />)}
          </div>
        )}
        <dl className="premium-specs">
          {composicion.length > 0 && <Dato label="Composición">{composicion.map(parte => `${parte.percent} % ${parte.fiber}`).join(' · ')}</Dato>}
          {ficha?.fabricWeightGsm ? <Dato label="Gramaje">{ficha.fabricWeightGsm} g/m²</Dato> : null}
          {ficha?.origin ? <Dato label="Origen">{ficha.origin}</Dato> : null}
          {cuidados.length > 0 && <Dato label="Cuidados">{cuidados.join(' · ')}</Dato>}
          {ficha?.limitedUnits ? <Dato label="Tirada">{ficha.limitedUnits} unidades</Dato> : null}
        </dl>
        {ensayos.length > 0 && (
          <div className="premium-tests">
            <p className="premium-tests-title">Ensayos</p>
            <ul>
              {ensayos.map((ensayo, i) => (
                <li key={`${ensayo.name}-${i}`}>
                  <span className="premium-test-name">{ensayo.name}</span>
                  {ensayo.result && <span className="premium-test-result">{ensayo.result}</span>}
                  {ensayo.method && <span className="premium-test-method">{ensayo.method}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {ficha?.story && <p className="premium-story">{ficha.story}</p>}
        <div className="premium-foot">
          <span className="premium-price">{money(product.basePrice)}</span>
          <button type="button" className="premium-cta" onClick={() => onOpen(product)}>Ver ficha <span aria-hidden="true">→</span></button>
        </div>
      </div>
    </li>
  );
}

/**
 * Catalogo de la serie premium: va antes del catalogo normal y solo aparece si hay prendas
 * marcadas. No es una rejilla mas: cada prenda se presenta como una ficha tecnica, con los
 * datos que Jenny haya rellenado en el panel (composicion, gramaje, origen, cuidados, ensayos).
 */
export function PremiumSection({ items, onOpen }: { items: Product[]; onOpen: (product: Product) => void }) {
  if (items.length === 0) return null;
  // La cinta solo repite datos reales; si no hay ninguno, repite los nombres.
  const datos = Array.from(new Set(items.flatMap(product => [
    product.premium?.origin,
    product.premium?.fabricWeightGsm ? `${product.premium.fabricWeightGsm} g/m²` : null,
    product.premium?.limitedUnits ? `${product.premium.limitedUnits} unidades` : null,
  ]).filter((dato): dato is string => Boolean(dato))));
  const cinta = datos.length > 0 ? datos : items.map(product => product.name);
  return (
    <section id="premium" className="premium" aria-labelledby="premium-title">
      <div className="premium-head">
        <p className="eyebrow">SERIE PREMIUM · EDICIÓN LIMITADA</p>
        <h2 id="premium-title">Pocas prendas.<br /><em>Ninguna igual.</em></h2>
        <p className="premium-intro">Tejidos elegidos uno a uno, con la ficha técnica a la vista: composición, gramaje, origen y ensayos. Sin promesas que no se puedan comprobar.</p>
      </div>
      <div className="premium-ticker" aria-hidden="true">
        <div className="premium-ticker-track">
          {[0, 1].map(copia => (
            <div className="premium-ticker-group" key={copia}>
              {[...cinta, ...cinta].map((dato, i) => <span key={`${copia}-${i}`}>{dato}<i>·</i></span>)}
            </div>
          ))}
        </div>
      </div>
      <ol className="premium-list">
        {items.map((product, index) => <PremiumItem key={product.id} product={product} index={index} onOpen={onOpen} />)}
      </ol>
    </section>
  );
}
