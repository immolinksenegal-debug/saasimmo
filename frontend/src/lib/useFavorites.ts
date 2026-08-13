'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

const STORAGE_KEY = 'immolink-favorites';

function readStored(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Favorites store. Anonymous visitors (userId undefined) keep the
 * client-only localStorage behavior. Logged-in users get real,
 * server-backed favorites via /api/favorites + POST
 * /api/properties/[id]/favorite (see route for the Property.favs
 * denormalized-counter sync) — pass the current user's id to switch modes.
 */
export function useFavorites(userId?: string): {
  favorites: string[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
} {
  const { toast } = useToast();
  const [favorites, setFavorites] = useState<string[]>([]);
  const pending = useRef(new Set<string>());

  useEffect(() => {
    if (userId) {
      api<{ propertyIds: string[] }>('/api/favorites')
        .then((res) => setFavorites(res.propertyIds))
        .catch(() => {
          // stay empty on failure — toggling still works, just starts unfavorited
        });
    } else {
      setFavorites(readStored());
    }
  }, [userId]);

  const toggleFavorite = useCallback(
    (id: string) => {
      if (userId) {
        if (pending.current.has(id)) return; // one in-flight toggle per property
        pending.current.add(id);
        const wasFavorite = favorites.includes(id);
        setFavorites((prev) => (wasFavorite ? prev.filter((x) => x !== id) : [...prev, id]));
        api(`/api/properties/${id}/favorite`, { method: 'POST' })
          .catch((err) => {
            // revert the optimistic update on failure
            setFavorites((prev) => (wasFavorite ? [...prev, id] : prev.filter((x) => x !== id)));
            toast(err instanceof ApiError ? err.message : 'Une erreur est survenue.', 'error');
          })
          .finally(() => pending.current.delete(id));
        return;
      }
      setFavorites((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [userId, favorites, toast],
  );

  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites]);

  return { favorites, isFavorite, toggleFavorite };
}
