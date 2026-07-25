/**
 * Version-history API (§4.2). Every function unwraps the §4.3 envelope and returns the
 * payload.
 *
 * `restore` is destructive in a way the UI must warn about first (§4.2): in one transaction
 * the server re-publishes version *v* as a new snapshot (the live site changes immediately)
 * **and** replaces the entire working set — `sections`/`section_items` are deleted and
 * rebuilt from the restored document. The consequence is that the admin's current
 * unpublished edits are lost, so the caller MUST confirm before invoking this.
 */
import apiClient from './apiClient';
import type { Version } from '../types/admin';

interface Envelope<T> {
  status: 'ok' | 'error';
  error: boolean;
  data?: T;
  errorMsg?: string;
}

function unwrap<T>(resp: { data: Envelope<T> }): T {
  return resp.data.data as T;
}

/** GET /api/admin/versions — the published version history (§4.2). */
export async function getVersions(): Promise<Version[]> {
  return unwrap<Version[]>(await apiClient.get('/api/admin/versions'));
}

/**
 * POST /api/admin/versions/:v/restore — re-publish version `v` as a new snapshot and reset
 * the working set to it (§4.2). Discards the current unpublished edits; confirm first.
 */
export async function restoreVersion(v: number): Promise<void> {
  await apiClient.post(`/api/admin/versions/${v}/restore`, {});
}
