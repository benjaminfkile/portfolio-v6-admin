/**
 * Admin pages API (v1.1, §3.10, §4.2). Every function unwraps the §4.3 response envelope
 * ({status,error,data}) and returns just the payload, following the versionsApi/sectionsApi
 * conventions.
 *
 * Mutating writes carry the optimistic-concurrency precondition `expected_updated_at`
 * (§4.5); a stale timestamp comes back as 409, which is translated here into a typed
 * {@link ConflictError} the UI catches to raise the "changed since you loaded it" refetch
 * dialog. The reorder route is a full-array id replacement (§4.2) and is exempt from the
 * precondition — losing that race costs a re-drag, not data.
 *
 * `deletePage` removes the page AND its sections server-side (§4.2), so the UI must confirm
 * with an explicit cascade warning before calling it.
 */
import axios from 'axios';
import apiClient from './apiClient';
import type { Page } from '../types/admin';

/** The §4.3 success envelope. Errors come back as non-2xx and are thrown by axios. */
interface Envelope<T> {
  status: 'ok' | 'error';
  error: boolean;
  data?: T;
  errorMsg?: string;
}

/** Thrown when a PATCH is rejected with 409 because the row changed since load (§4.5). */
export class ConflictError extends Error {
  constructor(message = 'This page changed since you loaded it.') {
    super(message);
    this.name = 'ConflictError';
  }
}

function unwrap<T>(resp: { data: Envelope<T> }): T {
  return resp.data.data as T;
}

/** Translate a 409 into ConflictError; re-throw everything else untouched. */
function rethrowConflict(err: unknown): never {
  if (axios.isAxiosError(err) && err.response?.status === 409) {
    throw new ConflictError();
  }
  throw err;
}

export interface CreatePagePayload {
  slug: string;
  title: string;
  nav_label?: string | null;
}

export interface UpdatePagePayload {
  slug?: string;
  title?: string;
  nav_label?: string | null;
  is_hidden?: boolean;
  /** The `updated_at` from the row as it was last read (§4.5). Required. */
  expected_updated_at: string;
}

/**
 * GET /api/admin/pages — all pages in nav order (§4.2). Codes defensively for either a bare
 * array in `data` or a keyed `{ pages: [...] }`, matching how the admin API list endpoints
 * vary (see the other api modules).
 */
export async function getPages(): Promise<Page[]> {
  const data = unwrap<Page[] | { pages: Page[] }>(await apiClient.get('/api/admin/pages'));
  return Array.isArray(data) ? data : (data?.pages ?? []);
}

/** POST /api/admin/pages — create a page (slug validated + reserved list server-side). */
export async function createPage(payload: CreatePagePayload): Promise<Page> {
  return unwrap<Page>(await apiClient.post('/api/admin/pages', payload));
}

/** PATCH /api/admin/pages/:id — update slug/title/nav_label/is_hidden (409 on conflict). */
export async function updatePage(id: string, payload: UpdatePagePayload): Promise<Page> {
  try {
    return unwrap<Page>(await apiClient.patch(`/api/admin/pages/${id}`, payload));
  } catch (err) {
    rethrowConflict(err);
  }
}

/** DELETE /api/admin/pages/:id — delete the page AND its sections (§4.2). */
export async function deletePage(id: string): Promise<void> {
  await apiClient.delete(`/api/admin/pages/${id}`);
}

/** PUT /api/admin/pages/order — reorder the nav with the full ordered id array (§4.2). */
export async function reorderPages(ids: string[]): Promise<void> {
  await apiClient.put('/api/admin/pages/order', { ids });
}
