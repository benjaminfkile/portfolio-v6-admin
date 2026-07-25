/**
 * Slug helpers for posts (§3.6). A slug is the URL segment and is immutable once published;
 * before first publish the admin lets the owner edit it freely, seeding a suggestion from
 * the title. Pure and JSX-free for direct unit testing.
 */

/** Lowercase, hyphenate, and strip anything that is not `[a-z0-9-]` — a safe URL segment. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
