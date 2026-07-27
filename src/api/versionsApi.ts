/**
 * Version-history + publish API (§4.2, §3.9). Every function unwraps the §4.3 envelope and
 * returns the payload.
 *
 * `publishSite` snapshots the current working set as a new live version. The API re-validates
 * the entire working set first (§3.9 item 3) and refuses on any failure; that refusal surfaces
 * here as a typed {@link PublishValidationError} the UI lists clearly rather than as an opaque
 * toast — mirroring the per-post publish path (§4.2, `postsApi.publishPost`).
 *
 * `restore` is destructive in a way the UI must warn about first (§4.2): in one transaction
 * the server re-publishes version *v* as a new snapshot (the live site changes immediately)
 * **and** replaces the entire working set — `sections`/`section_items` are deleted and
 * rebuilt from the restored document. The consequence is that the admin's current
 * unpublished edits are lost, so the caller MUST confirm before invoking this.
 */
import axios from 'axios';
import apiClient from './apiClient';
import type { Version } from '../types/admin';

interface Envelope<T> {
  status: 'ok' | 'error';
  error: boolean;
  data?: T;
  errorMsg?: string;
  /** Publish validation may return a per-issue list alongside `errorMsg` (§3.9). */
  errors?: string[];
}

function unwrap<T>(resp: { data: Envelope<T> }): T {
  return resp.data.data as T;
}

/**
 * Thrown when `POST /api/admin/publish` refuses because the working set failed server-side
 * validation (§3.9 item 3). `issues` carries the per-section/item problems when the API
 * returns them so the UI can list each one.
 */
export class PublishValidationError extends Error {
  issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = 'PublishValidationError';
    this.issues = issues;
  }
}

/** GET /api/admin/versions — the published version history (§4.2). */
export async function getVersions(): Promise<Version[]> {
  return unwrap<{ versions: Version[] }>(await apiClient.get('/api/admin/versions')).versions;
}

/**
 * POST /api/admin/publish — validate the working set and snapshot it as a new live version
 * (§4.2, §3.9). Returns the newly appended {@link Version}. A validation refusal surfaces as
 * {@link PublishValidationError}; everything else re-throws.
 */
export async function publishSite(): Promise<Version> {
  try {
    return unwrap<Version>(await apiClient.post('/api/admin/publish', {}));
  } catch (err) {
    throw toPublishError(err);
  }
}

function toPublishError(err: unknown): Error {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const body = err.response?.data as Envelope<unknown> | undefined;
    // 400/422 from publish means the working set failed validation (§3.9 item 3).
    if (status === 400 || status === 422) {
      return new PublishValidationError(
        body?.errorMsg ?? 'The page failed validation and was not published.',
        Array.isArray(body?.errors) ? body!.errors! : [],
      );
    }
  }
  return err instanceof Error ? err : new Error('Could not publish the page.');
}

/**
 * POST /api/admin/versions/:v/restore — re-publish version `v` as a new snapshot and reset
 * the working set to it (§4.2). Discards the current unpublished edits; confirm first.
 */
export async function restoreVersion(v: number): Promise<void> {
  await apiClient.post(`/api/admin/versions/${v}/restore`, {});
}
