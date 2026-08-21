'use client';

// /admin/withdrawals — read + cancel view of Withdrawal rows (seller payout
// requests) so the site owner isn't blind to real cash-out demand once
// payouts are live. GET is requireAdmin('ADMIN'); the cancel action is
// requireSuperadmin (server-enforced) — an ADMIN viewer sees the button but
// gets a clear error if they try it, rather than a client-side role check
// the front end has no way to verify.

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AdminNav } from '@/components/immolink/AdminNav';
import { formatFcfa } from '@/lib/mock/immolink';

interface Destination {
  method?: string;
  phone?: string;
  accountName?: string;
}

interface AdminWithdrawal {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  destination: Destination | null;
  provider: string;
  providerPayoutId: string | null;
  failureReason: string | null;
  requestedAt: string;
  processedAt: string | null;
  completedAt: string | null;
}

const STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;

const STATUS_CLASS: Record<string, string> = {
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  PROCESSING: 'bg-blue-50 text-blue-700 border-blue-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
  CANCELLED: 'bg-gray-100 text-gray-600 border-gray-200',
};

const CANCELLABLE = new Set(['PENDING', 'PROCESSING']);

export default function AdminWithdrawalsPage() {
  const user = useUser();
  const { toast } = useToast();

  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (opts: { status: string; cursor?: string | null }) => {
    try {
      const params = new URLSearchParams();
      if (opts.status) params.set('status', opts.status);
      if (opts.cursor) params.set('cursor', opts.cursor);
      const res = await api<{ items: AdminWithdrawal[]; nextCursor: string | null }>(
        `/api/admin/withdrawals?${params.toString()}`,
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
    setWithdrawals(null);
    void load({ status }).then((res) => {
      if (!res) return;
      setWithdrawals(res.items);
      setNextCursor(res.nextCursor);
    });
  }, [user, status, load]);

  async function onLoadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    const res = await load({ status, cursor: nextCursor });
    if (res) {
      setWithdrawals((prev) => [...(prev ?? []), ...res.items]);
      setNextCursor(res.nextCursor);
    }
    setLoadingMore(false);
  }

  async function onCancel(w: AdminWithdrawal) {
    const reason = window.prompt(
      `Annuler ce retrait de ${formatFcfa(w.amount)} FCFA — motif (obligatoire) :`,
    );
    if (!reason || !reason.trim()) return;
    setBusyId(w.id);
    try {
      await api(`/api/admin/withdrawals/${w.id}/cancel`, {
        method: 'POST',
        body: { reason: reason.trim() },
      });
      toast('Retrait annulé.', 'success');
      setWithdrawals(
        (prev) =>
          prev?.map((x) =>
            x.id === w.id ? { ...x, status: 'CANCELLED', failureReason: reason } : x,
          ) ?? null,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        toast('Réservé aux super-administrateurs.', 'error');
      } else {
        toast(err instanceof ApiError ? err.message : 'Erreur réseau.', 'error');
      }
    } finally {
      setBusyId(null);
    }
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
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-12">
      <AdminNav />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Demandes de retrait</h1>
        <p className="text-sm text-gray-600">
          Retraits demandés par les vendeurs (Wave / Orange Money / autres), les plus récents
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
      {withdrawals === null && !loadError && <p className="text-sm text-gray-600">Chargement…</p>}
      {withdrawals?.length === 0 && (
        <p className="text-sm text-gray-600">Aucune demande de retrait pour le moment.</p>
      )}

      {withdrawals && withdrawals.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-bold tracking-wide text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Montant</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Motif d&apos;échec</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                    {new Date(w.requestedAt).toLocaleString('fr-FR', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {w.destination?.method ?? '—'}
                    {w.destination?.phone ? ` · ${w.destination.phone}` : ''}
                  </td>
                  <td className="px-4 py-3 font-semibold">{formatFcfa(w.amount)} FCFA</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-bold ${STATUS_CLASS[w.status] ?? 'border-gray-200 bg-gray-50 text-gray-600'}`}
                    >
                      {w.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{w.failureReason ?? '—'}</td>
                  <td className="px-4 py-3">
                    {CANCELLABLE.has(w.status) ? (
                      <button
                        type="button"
                        disabled={busyId === w.id}
                        onClick={() => onCancel(w)}
                        className="text-xs font-bold text-red-600 underline disabled:opacity-50"
                      >
                        Annuler
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
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
