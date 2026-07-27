/**
 * Admin sections & items API (§4.2). Every function unwraps the file-manager-api response
 * envelope (§4.3) and returns just the payload. Mutating writes carry the optimistic
 * concurrency precondition `expected_updated_at` (§4.5); a mismatch comes back as 409,
 * which is translated here into a typed {@link ConflictError} the UI can catch to raise
 * the "changed since you loaded it" refetch dialog.
 *
 * The reorder routes are full-array id replacements (§4.2) and are exempt from the
 * precondition — losing that race costs a re-drag, not data.
 */
import axios from 'axios';
import apiClient from './apiClient';
import type { AdminSection, AdminSectionItem, ItemData, SectionData } from '../types/admin';
import type { SectionType } from '../types/content';

/** The §4.3 success envelope. Errors come back as non-2xx and are thrown by axios. */
interface Envelope<T> {
  status: 'ok' | 'error';
  error: boolean;
  data?: T;
  errorMsg?: string;
}

/** Thrown when a PATCH is rejected with 409 because the row changed since load (§4.5). */
export class ConflictError extends Error {
  constructor(message = 'This section changed since you loaded it.') {
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

export interface UpdatePayload {
  data?: SectionData | ItemData;
  is_hidden?: boolean;
  /** The `updated_at` from the row as it was last read (§4.5). Required. */
  expected_updated_at: string;
}

// ---- Sections ---------------------------------------------------------------

/** GET /api/admin/sections — the full working set, drafts included. */
export async function getSections(): Promise<AdminSection[]> {
  return unwrap<{ sections: AdminSection[] }>(await apiClient.get('/api/admin/sections')).sections;
}

/** POST /api/admin/sections — create a section of `type`. */
export async function createSection(type: SectionType, data: SectionData = {}): Promise<AdminSection> {
  return unwrap<AdminSection>(await apiClient.post('/api/admin/sections', { type, data }));
}

/** PATCH /api/admin/sections/:id — update `data` and/or `is_hidden` (409 on conflict). */
export async function updateSection(id: string, payload: UpdatePayload): Promise<AdminSection> {
  try {
    return unwrap<AdminSection>(await apiClient.patch(`/api/admin/sections/${id}`, payload));
  } catch (err) {
    rethrowConflict(err);
  }
}

/** DELETE /api/admin/sections/:id — delete (cascades to items). */
export async function deleteSection(id: string): Promise<void> {
  await apiClient.delete(`/api/admin/sections/${id}`);
}

/** PUT /api/admin/sections/order — reorder with the full ordered id array (§4.2). */
export async function reorderSections(ids: string[]): Promise<void> {
  await apiClient.put('/api/admin/sections/order', { ids });
}

// ---- Items ------------------------------------------------------------------

/** POST /api/admin/sections/:id/items — create an item in a section. */
export async function createItem(sectionId: string, data: ItemData): Promise<AdminSectionItem> {
  return unwrap<AdminSectionItem>(
    await apiClient.post(`/api/admin/sections/${sectionId}/items`, { data }),
  );
}

/** PATCH /api/admin/items/:id — update an item's `data`/`is_hidden` (409 on conflict). */
export async function updateItem(id: string, payload: UpdatePayload): Promise<AdminSectionItem> {
  try {
    return unwrap<AdminSectionItem>(await apiClient.patch(`/api/admin/items/${id}`, payload));
  } catch (err) {
    rethrowConflict(err);
  }
}

/** DELETE /api/admin/items/:id — delete an item. */
export async function deleteItem(id: string): Promise<void> {
  await apiClient.delete(`/api/admin/items/${id}`);
}

/** PUT /api/admin/sections/:id/items/order — reorder items with the full id array. */
export async function reorderItems(sectionId: string, ids: string[]): Promise<void> {
  await apiClient.put(`/api/admin/sections/${sectionId}/items/order`, { ids });
}
