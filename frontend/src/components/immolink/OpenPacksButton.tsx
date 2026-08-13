'use client';

import { usePacksModal } from '@/contexts/PacksModalContext';

export function OpenPacksButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  const { openPacks } = usePacksModal();
  return (
    <button type="button" onClick={openPacks} className={className}>
      {children}
    </button>
  );
}
