import { useMemo, useState } from 'react';
import { ORDER_STATUSES, STATUS_LABELS, api, type Order, type OrderStatus } from '../api';
import { Confirm, formatDate, money, useToast } from './ui';

const OPEN: OrderStatus[] = ['Pending', 'Confirmed', 'Preparing', 'Shipped'];

type Bucket = 'open' | 'delivered' | 'cancelled' | 'all';

export function OrdersTab({ token, orders, onChanged }: { token: string; orders: Order[]; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [bucket, setBucket] = useState<Bucket>('open');
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (bucket === 'open' && !OPEN.includes(o.status as OrderStatus)) return false;
      if (bucket === 'delivered' && o.status !== 'Delivered') return false;
      if (bucket === 'cancelled' && o.status !== 'Cancelled') return false;
      if (!term) return true;
      return `${o.customerName} ${o.customerPhone} ${o.id}`.toLowerCase().includes(term);
    });
  }, [orders, bucket, search]);

  const changeStatus = async (o: Order, status: string) => {
    try {
      await api.setStatus(token, o.id, status);
      await onChanged();
      toast.success(`Pedido marcado como ${STATUS_LABELS[status as OrderStatus] ?? status}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el estado.');
    }
  };

  const destroy = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await api.deleteOrder(token, pendingDelete.id);
      await onChanged();
      toast.success('Pedido eliminado.');
      setPendingDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar el pedido.');
    } finally {
      setBusy(false);
    }
  };

  const counts = {
    open: orders.filter((o) => OPEN.includes(o.status as OrderStatus)).length,
    delivered: orders.filter((o) => o.status === 'Delivered').length,
    cancelled: orders.filter((o) => o.status === 'Cancelled').length,
    all: orders.length,
  };

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Pedidos</h1>
          <p>Confirma, prepara y envia. El cliente ve el estado en cuanto lo cambias.</p>
        </div>
        <div className="adm-tools">
          <button type="button" className="adm-btn" onClick={() => onChanged()}>
            Actualizar
          </button>
        </div>
      </header>

      <div className="adm-filters">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, telefono o ID"
          aria-label="Buscar pedidos"
          style={{ flex: '1 1 260px', minWidth: 200, padding: '9px 13px', border: '1px solid var(--j-line)', background: '#fff', font: 'inherit', fontSize: 14 }}
        />
        {(
          [
            ['open', 'Abiertos'],
            ['delivered', 'Entregados'],
            ['cancelled', 'Cancelados'],
            ['all', 'Todos'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" className="adm-pill" aria-pressed={bucket === key} onClick={() => setBucket(key)}>
            {label} ({counts[key]})
          </button>
        ))}
      </div>

      <div className="adm-orders">
        {visible.length === 0 && (
          <div className="adm-empty">
            <h3>{orders.length === 0 ? 'Todavia no hay pedidos' : 'Ningun pedido coincide'}</h3>
            <p>{orders.length === 0 ? 'Los pedidos que hagan los clientes apareceran aqui.' : 'Cambia el filtro o la busqueda.'}</p>
          </div>
        )}

        {visible.map((o) => (
          <article className="adm-order" key={o.id}>
            <header className="adm-order-head">
              <div className="adm-order-who">
                <h3>{o.customerName}</h3>
                <p>
                  {o.customerPhone} · {o.deliveryAddress}
                </p>
                <p className="adm-order-id">
                  {o.id.slice(0, 8)} · {formatDate(o.createdAt)}
                </p>
              </div>
              <span className="adm-status" data-s={o.status}>
                {STATUS_LABELS[o.status as OrderStatus] ?? o.status}
              </span>
            </header>

            <div className="adm-order-items">
              {o.items.length === 0 && <p className="adm-hint">Sin detalle de articulos.</p>}
              {o.items.map((item, i) => (
                <div className="adm-line" key={`${o.id}-${i}`}>
                  <span>
                    <b>
                      {item.quantity} x {item.name}
                    </b>
                    <br />
                    <small>
                      {item.size} · {item.color} · {money(item.unitPrice)} c/u
                    </small>
                  </span>
                  <span>{money(item.lineTotal)}</span>
                </div>
              ))}
            </div>

            {o.notes && <p className="adm-order-note">Nota del cliente: {o.notes}</p>}

            <footer className="adm-order-foot">
              <span className="adm-order-total">{money(o.total)}</span>
              <div className="adm-tools">
                <select value={o.status} onChange={(e) => changeStatus(o, e.target.value)} aria-label={`Estado del pedido de ${o.customerName}`}>
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
                {o.status !== 'Delivered' && o.status !== 'Cancelled' && (
                  <button type="button" className="adm-btn adm-btn-sm adm-btn-primary" onClick={() => changeStatus(o, 'Delivered')}>
                    Marcar entregado
                  </button>
                )}
                <button type="button" className="adm-btn adm-btn-sm adm-btn-danger" onClick={() => setPendingDelete(o)}>
                  Borrar
                </button>
              </div>
            </footer>
          </article>
        ))}
      </div>

      <Confirm
        open={pendingDelete !== null}
        title="Eliminar este pedido"
        body="El pedido y sus lineas se borraran de forma permanente. Si solo quieres dejar de atenderlo, cambialo a Cancelado."
        summary={
          pendingDelete && (
            <>
              <strong>{pendingDelete.customerName}</strong> · {money(pendingDelete.total)}
              <br />
              {pendingDelete.items.length} articulos · {pendingDelete.id.slice(0, 8)}
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