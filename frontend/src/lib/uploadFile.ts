'use client';

// Multipart upload helper for POST /api/upload. Split out from lib/api.ts
// (protected — see CLAUDE.md "do not extend retry to mutating verbs")
// because that wrapper always JSON.stringifies the body and can't carry a
// FormData/File payload. CSRF + credentials handling mirrors api.ts.

import { API_URL, COOKIE_PREFIX } from './constants';
import { ApiError } from './api';

const CSRF_COOKIE_NAME = `${COOKIE_PREFIX}-csrf`;

function readCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const fromStorage = localStorage.getItem(CSRF_COOKIE_NAME);
  if (fromStorage) return fromStorage;
  const escaped = CSRF_COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

export interface UploadResult {
  id: string;
  key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  const csrf = readCsrfToken();

  const res = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    credentials: 'include',
    headers: csrf ? { 'x-csrf-token': csrf } : {},
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    const message =
      typeof body.message === 'string' ? body.message : `Upload failed (${res.status})`;
    throw new ApiError(res.status, message, body);
  }

  return res.json() as Promise<UploadResult>;
}
