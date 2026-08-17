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
 * admin, the only path by which content enters the system, mirrors the API allowlist
 * (http/https for web links, mailto/tel for contact links) and rejects everything else.
 */
export function isValidLinkUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'http:' ||
    parsed.protocol === 'https:' ||
    parsed.protocol === 'mailto:' ||
    parsed.protocol === 'tel:'
  );
}

// Deliberately lax email match — user@domain.tld — so quick typing isn't rejected;
// the API's stricter validation catches genuinely malformed addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A "phone" for auto-prefix purposes: digits with optional +, spaces, dashes,
// parentheses, or dots. Must contain at least 3 digits so a stray "1" isn't rewritten
// as tel:1.
const PHONE_ALLOWED_RE = /^\+?[\d\s\-().]+$/;

// Matches any explicit URL scheme (e.g. "https:", "mailto:", "javascript:") so we can
// leave already-prefixed input alone rather than double-prefixing it.
const EXPLICIT_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Prepare a link URL for validation/persistence. Explicit schemes pass through
 * untouched; a bare email becomes `mailto:…`; a bare phone number becomes `tel:` with
 * only the dialable characters (a leading `+` is preserved, everything else stripped
 * to digits). Anything else is returned trimmed as-is and will fail validation.
 */
export function normalizeLinkUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (EXPLICIT_SCHEME_RE.test(trimmed)) return trimmed;
  if (EMAIL_RE.test(trimmed)) return `mailto:${trimmed}`;
  if (PHONE_ALLOWED_RE.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length >= 3) {
      return `tel:${trimmed.startsWith('+') ? '+' : ''}${digits}`;
    }
  }
  return trimmed;
}

export interface LinkFieldErrors {
  label?: string;
  url?: string;
}

/**
 * Validate a single Link row: label required, url must resolve (after {@link
 * normalizeLinkUrl}) to an http/https/mailto/tel URL. Normalizing before validation
 * means a bare email or phone number in the field doesn't block Save while the user
 * is still typing — the LinkEditor rewrites the state on blur.
 */
export function validateLink(link: Link): LinkFieldErrors {
  const errors: LinkFieldErrors = {};
  if (!link.label.trim()) {
    errors.label = 'Label is required';
  }
  if (!isValidLinkUrl(normalizeLinkUrl(link.url))) {
    errors.url = 'Enter a URL, email, or phone number';
  }
  return errors;
}

/** True when every link in the array is valid. Used to gate the parent form's Save. */
export function areLinksValid(links: Link[]): boolean {
  return links.every((link) => Object.keys(validateLink(link)).length === 0);
}
