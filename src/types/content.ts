/**
 * GENERATED-EQUIVALENT — DO NOT HAND-DRIFT.
 *
 * These types are hand-derived to match the canonical Zod schemas in
 * `portfolio-v6-api/src/schemas/` exactly as described in TECH_SPEC_V1.md §3. Once the
 * API is reachable, `npm run sync:types` fetches `<api>/api/schema` (§8.4) and
 * regenerates this file from the JSON Schema — at which point this file becomes
 * machine-authored and manual edits here will be overwritten. Until then, the committed
 * file is authoritative and must be kept in lockstep with §3 by hand.
 *
 * v5's `playbackRate` vs `playback_rate` / `img_title` vs `file_name` drift is the exact
 * failure this single source of truth exists to prevent — field names are snake_case to
 * match the JSONB `data` blobs stored by the API.
 */

/* ------------------------------------------------------------------ Links (§3.4) --- */

/**
 * A single outbound link. Replaces v5's `url`/`repo` scalars with one ordered array so a
 * project can span several repos, a dev and a prod deployment, docs, etc. `label` is
 * required and NOT derived from `type` (five `repo` links are otherwise indistinguishable);
 * `type` drives icon/grouping, `label` says which one. Array order is display order.
 * Validation (API-side): protocol allowlist of `http`/`https` only.
 */
export interface Link {
  type: 'repo' | 'prod' | 'dev' | 'docs' | 'demo' | 'package' | 'article' | 'other';
  label: string;
  url: string;
}

/* -------------------------------------------------------- Section types (§3.4) ----- */

/** `sections.type` — a string in the DB, a discriminated union in TS (§3.4). */
export type SectionType =
  | 'hero'
  | 'about'
  | 'timeline'
  | 'skills'
  | 'portfolio'
  | 'status'
  | 'blog'
  | 'now_playing'
  | 'duolingo'
  | 'github'
  | 'ops'
  | 'contact';

/* -- Section `data` shapes ---------------------------------------------------------- */

/** hero — static section: title, tagline, optional background media (§3.4, §3.8). */
export interface HeroData {
  title: string;
  tagline?: string;
  background_media_id?: string;
}

/** about — static prose section (no items). */
export interface AboutData {
  heading?: string;
  body: string;
}

/** timeline — optional heading; entries live in `section_items` (§3.4). */
export interface TimelineData {
  heading?: string;
  intro?: string;
}

/**
 * skills — optional heading; entries live in `section_items` (§3.4). `sphere_detail` is the
 * three.js `IcosahedronGeometry` detail parameter for the public geodesic-sphere renderer
 * (v1.5): an optional integer 0–4 whose face count is 20·(detail+1)² → 20/80/180/320/500.
 * Absent = AUTO: the renderer picks the smallest detail whose face count ≥ the number of
 * skill items (clamped to 4).
 */
export interface SkillsData {
  heading?: string;
  intro?: string;
  sphere_detail?: number;
}

/** portfolio — optional heading/intro; projects live in `section_items` (§3.4). */
export interface PortfolioData {
  heading?: string;
  intro?: string;
}

/**
 * status — live section (§3.5): only configuration is published; data is fetched from
 * `GET /api/status` at runtime. Config: which services to show, whether to show times.
 */
export interface StatusData {
  services: string[];
  show_response_times: boolean;
}

/**
 * blog — live section (§3.5): config only. How many posts, optional tag filter; the
 * listing is fetched from `GET /api/posts` at runtime.
 */
export interface BlogData {
  limit: number;
  tag?: string;
}

/**
 * now_playing — live section (§3.5): config only. Idle behavior and whether to show album
 * art; the track is fetched from `GET /api/now-playing` at runtime.
 */
export interface NowPlayingData {
  idle: 'hide' | 'message';
  idle_message?: string;
  show_album_art: boolean;
}

/**
 * duolingo — live section (§3.5, v1.2): config only. Course code + optional
 * hand-maintained score label; streak/XP fetched from `GET /api/duolingo` at runtime.
 */
export interface DuolingoData {
  heading?: string;
  intro?: string;
  language: string;
  score_label?: string;
}

/**
 * github — live section (§3.5, v1.2): config only. Contribution-calendar weeks;
 * data fetched from `GET /api/github` at runtime.
 */
export interface GithubData {
  heading?: string;
  intro?: string;
  weeks?: number;
}

/**
 * ops — live section (§3.5, v1.3): config only. Metric lookback window; telemetry
 * fetched from `GET /api/ops` at runtime.
 */
export interface OpsData {
  heading?: string;
  intro?: string;
  window_hours?: number;
}

/** contact — static section (no items). */
export interface ContactData {
  heading?: string;
  body?: string;
  links?: Link[];
}

/* -- Section `section_items[].data` shapes (§3.4) ----------------------------------- */

export interface TimelineItemData {
  date_range: string;
  title: string;
  description: string;
  media_id?: string;
}

/**
 * skills item (§3.4, Icons v1.6). `icon_source` is the default (light-theme) icon URL,
 * required as today. `icon_source_dark` is an OPTIONAL dark-theme override URL; every
 * renderer falls back to `icon_source` when it is absent. Both are plain URL strings —
 * source-agnostic (devicon, simpleicons, custom, self-hosted).
 */
export interface SkillItemData {
  title: string;
  description: string;
  icon_source: string;
  icon_source_dark?: string;
}

export interface PortfolioItemData {
  title: string;
  intro: string;
  description: string;
  media_id: string;
  playback_rate?: number;
  transform_value?: string;
  tech_icons: string[];
  links: Link[];
}

/** The union of every item `data` shape (sections without items have none). */
export type SectionItemData = TimelineItemData | SkillItemData | PortfolioItemData;

/* -- Assembled section / item records ----------------------------------------------- */

/** One repeatable child of a section (a project, a skill, a timeline entry). */
export interface SectionItem<TData extends SectionItemData = SectionItemData> {
  id: string;
  position: number;
  is_hidden: boolean;
  data: TData;
}

interface SectionBase<TType extends SectionType, TData, TItem extends SectionItemData = never> {
  id: string;
  type: TType;
  position: number;
  is_hidden: boolean;
  data: TData;
  /** Present only for section types that have repeatable content (§3.4). */
  items: [TItem] extends [never] ? [] : SectionItem<TItem>[];
}

export type Section =
  | SectionBase<'hero', HeroData>
  | SectionBase<'about', AboutData>
  | SectionBase<'timeline', TimelineData, TimelineItemData>
  | SectionBase<'skills', SkillsData, SkillItemData>
  | SectionBase<'portfolio', PortfolioData, PortfolioItemData>
  | SectionBase<'status', StatusData>
  | SectionBase<'blog', BlogData>
  | SectionBase<'now_playing', NowPlayingData>
  | SectionBase<'duolingo', DuolingoData>
  | SectionBase<'github', GithubData>
  | SectionBase<'ops', OpsData>
  | SectionBase<'contact', ContactData>;

/* ------------------------------------------------------- Post body blocks (§3.7) --- */

/**
 * Block — an ordered, discriminated union on `type`, mirroring the section registry so
 * the same rendering/validation applies one level down (§3.7). Inline text in
 * `paragraph`/`list`/`quote` is a constrained markdown subset; raw HTML is never stored.
 */
export type Block =
  | { type: 'heading'; level: 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; language: string; code: string; filename?: string }
  | { type: 'media'; media_id: string; caption?: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string; attribution?: string }
  | { type: 'links'; links: Link[] }
  | { type: 'divider' };

export type BlockType = Block['type'];

/* --------------------------------------------------------------- Posts (§3.6) ------ */

/** A blog post as returned by the admin API — includes `draft_body` (§3.6, §4.2). */
export interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  cover_media_id: string | null;
  tags: string[];
  draft_body: Block[];
  /** null until first publish (§3.6). */
  published_body: Block[] | null;
  /** null = never published; doubles as the display date (§3.6). */
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Public post summary — `GET /api/posts` returns these, never bodies (§4.1). */
export interface PostSummary {
  slug: string;
  title: string;
  excerpt: string;
  cover: string | null;
  tags: string[];
  published_at: string;
}

/* ------------------------------------------ Published page document (§3.3, §4.1) --- */

/**
 * The immutable published snapshot served by `GET /api/content`. Media refs are resolved
 * to absolute CDN URLs at read time (§6.8); if nothing has ever been published, `sections`
 * is empty rather than a 404 (§4.1).
 */
export interface PageDocument {
  version: number;
  published_at: string;
  sections: Section[];
}
