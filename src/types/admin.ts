/**
 * Admin working-set types (§4.2). These mirror the DB rows returned by the
 * `/api/admin/sections` working set, which — unlike the published document shapes in
 * `content.ts` — carry `updated_at`. That column is load-bearing: every mutating write
 * echoes it back as `expected_updated_at` for the optimistic-concurrency check (§4.5).
 *
 * `data` is intentionally kept as an open `Record` here rather than the strict per-type
 * unions in `content.ts`: the admin editors are *form-generated* from the section
 * registry (§3.9 item 2), so they read and write arbitrary keys per the registry
 * descriptors. The strict shapes remain the canonical documentation of what those keys
 * are; the API's Zod schemas are what actually enforce them on write.
 */
import type { SectionType } from './content';

export type SectionData = Record<string, unknown>;
export type ItemData = Record<string, unknown>;

/** One repeatable child of a section, as returned by the admin API. */
export interface AdminSectionItem {
  id: string;
  position: number;
  is_hidden: boolean;
  data: ItemData;
  updated_at: string;
}

/** One section of the editable working set, drafts included. */
export interface AdminSection {
  id: string;
  type: SectionType;
  position: number;
  is_hidden: boolean;
  data: SectionData;
  items: AdminSectionItem[];
  updated_at: string;
}

/**
 * One published snapshot in the version history (§4.2 `GET /api/admin/versions`). Each
 * `POST /api/admin/publish` (and each restore) appends one of these; `version` is the
 * monotonically increasing snapshot number, `published_by` the admin who cut it.
 */
export interface Version {
  version: number;
  published_at: string;
  published_by: string;
}
