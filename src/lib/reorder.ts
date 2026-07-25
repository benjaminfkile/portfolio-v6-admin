/**
 * Pure helpers shared by the drag-and-drop reorder flows (§4.2, §14.4) and the Link
 * editor (§3.4). Kept free of React and dnd-kit so the ordering and validation logic can
 * be unit-tested directly without simulating pointer drags in jsdom.
 */
import type { Link } from '../types/content';

/**
 * Move the entry `activeId` to the slot currently held by `overId`, returning the full
 * reordered id array. This is exactly the payload the `PUT .../order` routes want — one
 * idempotent full-array replacement (§4.2) — so the drop handler can hand the result
 * straight to the API. Unknown ids or a no-op drop return a copy of the input unchanged.
 */
export function reorderIds(ids: string[], activeId: string, overId: string): string[] {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1 || from === to) {
    return [...ids];
  }
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Protocol allowlist for the Link editor (§3.4). `new URL()` accepts `javascript:` and
 * `data:` URLs — which become stored XSS the moment they land in an `href` — so the
 * admin, the only path by which content enters the system, blocks everything but
 * http/https here as well as server-side.
 */
export function isValidHttpUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

export interface LinkFieldErrors {
  label?: string;
  url?: string;
}

/** Validate a single Link row: label required, url must be http/https (§3.4). */
export function validateLink(link: Link): LinkFieldErrors {
  const errors: LinkFieldErrors = {};
  if (!link.label.trim()) {
    errors.label = 'Label is required';
  }
  if (!isValidHttpUrl(link.url)) {
    errors.url = 'Enter an http(s) URL';
  }
  return errors;
}

/** True when every link in the array is valid. Used to gate the parent form's Save. */
export function areLinksValid(links: Link[]): boolean {
  return links.every((link) => Object.keys(validateLink(link)).length === 0);
}
