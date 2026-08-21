'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export function PropertyRequestActions({
  requestId,
  status,
}: {
  requestId: string;
  status: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function setStatus(nextStatus: 'ACTIVE' | 'FULFILLED', successMessage: string) {
    setPending(true);
    try {
      await api(`/api/property-requests/${requestId}`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      toast(successMessage);
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Action impossible.', 'error');
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    const confirmed = window.confirm('Supprimer définitivement cette demande ?');
    if (!confirmed) return;
    setPending(true);
    try {
      await api(`/api/property-requests/${requestId}`, { method: 'DELETE' });
      toast('Demande supprimée.');
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Suppression impossible.', 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="flex items-center gap-3">
      {status === 'ACTIVE' && (
        <button
          type="button"
          onClick={() => setStatus('FULFILLED', 'Demande marquée comme trouvée.')}
          disabled={pending}
          className="im-tap cursor-pointer text-[13px] font-bold text-brand-green underline disabled:opacity-50"
        >
          Marquer trouvé
        </button>
      )}
      {status !== 'ACTIVE' && (
        <button
          type="button"
          onClick={() => setStatus('ACTIVE', 'Demande réactivée.')}
          disabled={pending}
          className="im-tap cursor-pointer text-[13px] font-bold text-brand-green underline disabled:opacity-50"
        >
          Réactiver
        </button>
      )}
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="im-tap cursor-pointer text-[13px] font-bold text-brand-red underline disabled:opacity-50"
      >
        Supprimer
      </button>
    </span>
  );
}
