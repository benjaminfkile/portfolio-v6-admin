/**
 * Admin posts API (§4.2, §3.6). Every function unwraps the file-manager-api response
 * envelope (§4.3) and returns just the payload.
 *
 * The block body is written **wholesale** via `PATCH /api/admin/posts/:id` with a complete
 * `draft_body` array — blocks are not individually addressable endpoints (§4.2). Like
 * sections, metadata/body PATCHes carry the optimistic-concurrency precondition
 * `expected_updated_at` (§4.5); a 409 becomes the shared {@link ConflictError} so the UI can
 * raise the same "changed since you loaded it" refetch dialog.
 *
 * `publish` re-validates the whole post body server-side (§3.9 item 3) and refuses on any
 * failure; those failures surface here as a typed {@link PostValidationError} the editor
 * renders clearly rather than as an opaque toast.
 */
import axios from 'axios';
import apiClient from './apiClient';
import { ConflictError } from './sectionsApi';
import type { Block } from '../types/content';
import type { Post } from '../types/content';

export { ConflictError };

/** The §4.3 success envelope. Errors come back as non-2xx and are thrown by axios. */
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

/** Translate a 409 into ConflictError; re-throw everything else untouched (§4.5). */
function rethrowConflict(err: unknown): never {
  if (axios.isAxiosError(err) && err.response?.status === 409) {
    throw new ConflictError('This post changed since you loaded it.');
  }
  throw err;
}

/**
 * Thrown when `POST /api/admin/posts/:id/publish` refuses because the body failed
 * server-side validation (§3.9 item 3). `issues` carries the per-block problems when the
 * API returns them so the editor can list each one.
 */
export class PostValidationError extends Error {
  issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = 'PostValidationError';
    this.issues = issues;
  }
}

/** Payload for creating a post — only the identifying metadata; body starts empty (§3.6). */
export interface CreatePostPayload {
  title: string;
  slug: string;
}

/**
 * Payload for `PATCH /api/admin/posts/:id`. Any subset of metadata plus the wholesale
 * `draft_body`; `expected_updated_at` is **required** — an unconditional overwrite must be
 * impossible to express (§4.5).
 */
export interface UpdatePostPayload {
  title?: string;
  slug?: string;
  excerpt?: string;
  tags?: string[];
  cover_media_id?: string | null;
  /** The blog this post is assigned to; null unassigns it (Blogs v1.13). */
  blog_id?: string | null;
  /**
   * ISO 8601 UTC display date, or null to defer the stamp until first publish (task #134).
   * A published post that sends null keeps whatever the server currently holds; the admin
   * editor always sends the current field value so republish preserves it.
   */
  published_at?: string | null;
  draft_body?: Block[];
  expected_updated_at: string;
}

// ---- Reads -----------------------------------------------------------------

/** GET /api/admin/posts — all posts, drafts included (§4.2). */
export async function getPosts(): Promise<Post[]> {
  return unwrap<{ posts: Post[] }>(await apiClient.get('/api/admin/posts')).posts;
}

/** GET /api/admin/posts/:id — one post with its `draft_body` (§4.2). */
export async function getPost(id: string): Promise<Post> {
  return unwrap<Post>(await apiClient.get(`/api/admin/posts/${id}`));
}

// ---- Writes ----------------------------------------------------------------

/** POST /api/admin/posts — create a post from title + slug. */
export async function createPost(payload: CreatePostPayload): Promise<Post> {
  return unwrap<Post>(await apiClient.post('/api/admin/posts', payload));
}

/** PATCH /api/admin/posts/:id — wholesale metadata/`draft_body` update (409 on conflict). */
export async function updatePost(id: string, payload: UpdatePostPayload): Promise<Post> {
  try {
    return unwrap<Post>(await apiClient.patch(`/api/admin/posts/${id}`, payload));
  } catch (err) {
    rethrowConflict(err);
  }
}

/** DELETE /api/admin/posts/:id — delete a post. */
export async function deletePost(id: string): Promise<void> {
  await apiClient.delete(`/api/admin/posts/${id}`);
}

/**
 * POST /api/admin/posts/:id/publish — validate + `published_body := draft_body` (§3.6).
 * A validation refusal surfaces as {@link PostValidationError}; everything else re-throws.
 */
export async function publishPost(id: string): Promise<Post> {
  try {
    return unwrap<Post>(await apiClient.post(`/api/admin/posts/${id}/publish`, {}));
  } catch (err) {
    throw toPublishError(err);
  }
}

/** POST /api/admin/posts/:id/unpublish — null `published_at`, retain `published_body` (§3.6). */
export async function unpublishPost(id: string): Promise<Post> {
  return unwrap<Post>(await apiClient.post(`/api/admin/posts/${id}/unpublish`, {}));
}

// ---- Error mapping ---------------------------------------------------------

function toPublishError(err: unknown): Error {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const body = err.response?.data as Envelope<unknown> | undefined;
    // 400/422 from publish means the body failed validation (§3.9 item 3).
    if (status === 400 || status === 422) {
      return new PostValidationError(
        body?.errorMsg ?? 'The post failed validation and was not published.',
        Array.isArray(body?.errors) ? body!.errors! : [],
      );
    }
  }
  return err instanceof Error ? err : new Error('Could not publish the post.');
}
