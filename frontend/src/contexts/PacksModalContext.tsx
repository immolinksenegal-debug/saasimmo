'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface PacksModalContextValue {
  open: boolean;
  openPacks: () => void;
  closePacks: () => void;
}

const PacksModalContext = createContext<PacksModalContextValue | null>(null);

export function PacksModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openPacks = useCallback(() => setOpen(true), []);
  const closePacks = useCallback(() => setOpen(false), []);

  return (
    <PacksModalContext.Provider value={{ open, openPacks, closePacks }}>
      {children}
    </PacksModalContext.Provider>
  );
}

export function usePacksModal(): PacksModalContextValue {
  const ctx = useContext(PacksModalContext);
  if (!ctx) throw new Error('usePacksModal must be used inside a PacksModalProvider');
  return ctx;
}
