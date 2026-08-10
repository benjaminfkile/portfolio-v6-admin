/**
 * Admin blogs API (Blogs v1.13). Every function unwraps the §4.3 response envelope
 * ({status,error,data}) and returns just the payload, following the pagesApi conventions.
 *
 * Mutating writes carry the optimistic-concurrency precondition `expected_updated_at`
 * (§4.5); a stale timestamp comes back as 409, translated here into a typed
 * {@link ConflictError} the UI catches to raise the shared "changed since you loaded it"
 * refetch dialog.
 *
 * `deleteBlog` never deletes posts — the server unassigns that blog's posts
 * (`blog_id -> null`) and always succeeds, so the UI confirms with an "N posts become
 * unassigned" warning rather than a cascade-delete warning.
 */
import axios from 'axios';
import apiClient from './apiClient';
import type { Blog } from '../types/admin';

/** The §4.3 success envelope. Errors come back as non-2xx and are thrown by axios. */
interface Envelope<T> {
  status: 'ok' | 'error';
  error: boolean;
  data?: T;
  errorMsg?: string;
}

/** Thrown when a PATCH is rejected with 409 because the row changed since load (§4.5). */
export class ConflictError extends Error {
  constructor(message = 'This blog changed since you loaded it.') {
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

export interface CreateBlogPayload {
  slug: string;
  name: string;
}

export interface UpdateBlogPayload {
  slug?: string;
  name?: string;
  /** The `updated_at` from the row as it was last read (§4.5). Required. */
  expected_updated_at: string;
}

/**
 * GET /api/admin/blogs — all blogs. Codes defensively for either a bare array in `data` or a
 * keyed `{ blogs: [...] }`, matching how the admin API list endpoints vary (see pagesApi).
 */
export async function getBlogs(): Promise<Blog[]> {
  const data = unwrap<Blog[] | { blogs: Blog[] }>(await apiClient.get('/api/admin/blogs'));
  return Array.isArray(data) ? data : (data?.blogs ?? []);
}

/** POST /api/admin/blogs — create a blog (slug validated + uniqueness server-side; 409 dup). */
export async function createBlog(payload: CreateBlogPayload): Promise<Blog> {
  return unwrap<Blog>(await apiClient.post('/api/admin/blogs', payload));
}

/** PATCH /api/admin/blogs/:id — rename / re-slug a blog (409 on conflict or duplicate slug). */
export async function updateBlog(id: string, payload: UpdateBlogPayload): Promise<Blog> {
  try {
    return unwrap<Blog>(await apiClient.patch(`/api/admin/blogs/${id}`, payload));
  } catch (err) {
    rethrowConflict(err);
  }
}

/**
 * DELETE /api/admin/blogs/:id — always succeeds and unassigns that blog's posts
 * (`blog_id -> null`). Posts are never deleted (Blogs v1.13).
 */
export async function deleteBlog(id: string): Promise<void> {
  await apiClient.delete(`/api/admin/blogs/${id}`);
}
