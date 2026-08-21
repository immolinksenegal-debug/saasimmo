'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export function DeleteProjectButton({
  projectId,
  title,
  className,
  redirectTo,
}: {
  projectId: string;
  title: string;
  className?: string;
  /** Where to navigate after a successful archive. Omit to just refresh the current page. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const confirmed = window.confirm(
      `Archiver définitivement « ${title} » ? Cette action est irréversible.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await api(`/api/investment-projects/${projectId}`, { method: 'DELETE' });
      toast('Projet archivé.');
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Archivage impossible.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button type="button" onClick={onClick} disabled={deleting} className={className}>
      {deleting ? 'Archivage…' : 'Archiver'}
    </button>
  );
}
