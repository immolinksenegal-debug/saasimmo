'use client';

// /admin/orders — read-only view of Order rows (pack purchases, and any
// other future use of /api/subscriptions/checkout or /api/orders) so the
// site owner isn't blind to real payments once Bictorys is live. Gated by
// GET /api/admin/orders itself (requireAdmin('ADMIN')) — same pattern as
// /admin/promotions.

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { formatFcfa } from '@/lib/mock/immolink';

interface AdminOrder {
  id: string;
  userId: string | null;
  amount: number;
  currency: string;
  status: string;
  customerEmail: string | null;
  provider: string;
  paymentMethod: string | null;
  paidAt: string | null;
  createdAt: string;
}

const STATUSES = ['PENDING', 'PAID', 'EXPIRED', 'FAILED', 'REFUNDED'] as const;

const STATUS_CLASS: Record<string, string> = {
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
  EXPIRED: 'bg-gray-100 text-gray-600 border-gray-200',
  REFUNDED: 'bg-blue-50 text-blue-700 border-blue-200',
};

export default function AdminOrdersPage() {
  const user = useUser();

  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (opts: { status: string; cursor?: string | null }) => {
    try {
      const params = new URLSearchParams();
      if (opts.status) params.set('status', opts.status);
      if (opts.cursor) params.set('cursor', opts.cursor);
      const res = await api<{ items: AdminOrder[]; nextCursor: string | null }>(
        `/api/admin/orders?${params.toString()}`,
      );
      return res;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
        setForbidden(true);
      } else {
        setLoadError(err instanceof ApiError ? err.message : 'Erreur réseau.');
      }
      return null;
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setOrders(null);
    void load({ status }).then((res) => {
      if (!res) return;
      setOrders(res.items);
      setNextCursor(res.nextCursor);
    });
  }, [user, status, load]);

  async function onLoadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    const res = await load({ status, cursor: nextCursor });
    if (res) {
      setOrders((prev) => [...(prev ?? []), ...res.items]);
      setNextCursor(res.nextCursor);
    }
    setLoadingMore(false);
  }

  if (!user) return null;

  if (forbidden) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-xl font-bold">Accès refusé</h1>
        <p className="text-sm text-gray-600">
          Cette page est réservée aux administrateurs d&apos;ImmoLink Sénégal.
        </p>
        <Link href="/dashboard" className="text-sm text-brand-green underline">
          Retour au tableau de bord
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Paiements</h1>
        <p className="text-sm text-gray-600">
          Commandes de packs vendeurs (et tout achat via /api/orders), les plus récentes
          d&apos;abord.
        </p>
      </header>

      <label className="flex w-fit flex-col gap-1 text-sm">
        Statut
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2"
        >
          <option value="">Tous</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      {orders === null && !loadError && <p className="text-sm text-gray-600">Chargement…</p>}
      {orders?.length === 0 && (
        <p className="text-sm text-gray-600">Aucun paiement pour le moment.</p>
      )}

      {orders && orders.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-bold tracking-wide text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Montant</th>
                <th className="px-4 py-3">Moyen</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                    {new Date(o.createdAt).toLocaleString('fr-FR', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="px-4 py-3">{o.customerEmail ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold">{formatFcfa(o.amount)} FCFA</td>
                  <td className="px-4 py-3 text-gray-600">{o.paymentMethod ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-bold ${STATUS_CLASS[o.status] ?? 'border-gray-200 bg-gray-50 text-gray-600'}`}
                    >
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="w-fit rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {loadingMore ? 'Chargement…' : 'Charger plus'}
        </button>
      )}

      <Link href="/dashboard" className="text-center text-sm text-gray-600 underline">
        Retour au dashboard
      </Link>
    </main>
  );
}
