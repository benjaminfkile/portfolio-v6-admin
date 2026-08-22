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
 * Validation (API-side): protocol allowlist of `http`/`https` (web links) plus
 * `mailto`/`tel` (contact links) — no new `type` enum values, just a wider set of
 * accepted URL schemes.
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
  | 'contact'
  | 'resume';

/* -- Section `data` shapes ---------------------------------------------------------- */

/**
 * hero background tweaks (task #131). All keys optional; the site renders the documented
 * defaults when a key is absent, so an existing hero with only `background_media_id`
 * keeps looking as it does today (0.1 dark alpha was the original hard-coded value; light
 * currently renders the token 0.06). Values are numbers (not strings); the admin editor
 * omits keys left at their defaults so the stored JSON stays minimal.
 *
 *  opacity_dark    (0..1, default 0.1)  image alpha on the dark theme
 *  opacity_light   (0..1, default 0.06) image alpha on the light theme
 *  object_fit      css object-fit, default 'cover'
 *  object_position free-text css object-position, default '50% 50%'
 *  blur_px         (0..40, default 0)   css filter blur
 *  grayscale       (0..1,  default 0)   css filter grayscale
 *  brightness      (0..2,  default 1)   css filter brightness
 *  contrast        (0..2,  default 1)   css filter contrast
 *  saturate        (0..2,  default 1)   css filter saturate
 *  scale           (1..2,  default 1)   transform: scale(); hides soft edges of a blur
 *  overlay_dark    (0..1,  default 0)   alpha of a --ground overlay on the dark theme
 *  overlay_light   (0..1,  default 0)   alpha of a --ground overlay on the light theme
 */
export interface HeroBackground {
  opacity_dark?: number;
  opacity_light?: number;
  object_fit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  object_position?: string;
  blur_px?: number;
  grayscale?: number;
  brightness?: number;
  contrast?: number;
  saturate?: number;
  scale?: number;
  overlay_dark?: number;
  overlay_light?: number;
}

/** hero (§3.4, §3.8): title, tagline, optional background media, optional background tweaks. */
export interface HeroData {
  title: string;
  tagline?: string;
  background_media_id?: string;
  /** Light-theme backdrop; background_media_id is the dark-theme one. Each optional and independent. */
  background_light_media_id?: string;
  background?: HeroBackground;
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
 * blog — live section (§3.5): config only. `mode` picks between the two renderings:
 * `teaser` (the default, backwards-compatible with pre-mode blog sections) shows the
 * newest `limit` posts as a homepage/landing teaser; `index` renders the section as
 * the full blog index/listing so the Blog can be composed as its own admin-managed
 * page and ordered in the nav like any other page. `page_size` bounds how many posts
 * a single index page shows before paginating (index mode only). The listing itself is
 * fetched from `GET /api/posts` at runtime — only the config is published.
 */
export interface BlogData {
  mode?: 'teaser' | 'index';
  limit?: number;
  page_size?: number;
  blog?: string;
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
 * github — live section (§3.5, v1.10): config only. Heading + optional intro; the public
 * site renders a fully browsable contribution calendar (year picker), so the obsolete v1.2
 * `weeks` window is gone. Calendar data is fetched from `GET /api/github` at runtime.
 */
export interface GithubData {
  heading?: string;
  intro?: string;
}

/**
 * ops — live section (§3.5, v1.7 daily replay): config only. Heading + optional intro;
 * the immutable daily report is fetched from `GET /api/ops` at runtime.
 */
export interface OpsData {
  heading?: string;
  intro?: string;
}

/** contact — static section (no items). */
export interface ContactData {
  heading?: string;
  body?: string;
  links?: Link[];
}

/**
 * resume — live section: config only. Heading + optional intro; the newest confirmed resume
 * PDF (from `/api/resume`) is what the public site serves as the download link.
 */
export interface ResumeData {
  heading?: string;
  intro?: string;
}

/* -- Section `section_items[].data` shapes (§3.4) ----------------------------------- */

export interface TimelineItemData {
  date_range: string;
  title: string;
  description: string;
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

/**
 * portfolio item (§3.4, Skill Refs v1.8). `skill_refs` is an ordered array of skills
 * `section_items.id` uuids — items of `skills`-type sections on ANY page — REPLACING v5's
 * bare `tech_icons` URL array. Array order is render order; an empty array is allowed. The
 * public site renders each referenced skill's theme-aware icon (incl. `icon_source_dark`)
 * with the skill `title` as the accessible name, so portfolio marks and the skills sphere
 * can never show mismatched icons — consistency is enforced by construction. Mirrors the
 * API's zod schema exactly: it rejects `tech_icons` and requires each `skill_refs` entry to
 * be a uuid; publish 422s on any ref that does not resolve to a non-hidden item of a
 * non-hidden skills section (draft writes stay lenient).
 */
export interface PortfolioItemData {
  title: string;
  intro: string;
  description: string;
  media_id: string;
  playback_rate?: number;
  transform_value?: string;
  skill_refs: string[];
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
  | SectionBase<'contact', ContactData>
  | SectionBase<'resume', ResumeData>;

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
  /** The blog this post is assigned to, or null = unassigned (Blogs v1.13). */
  blog_id: string | null;
  /** Denormalised blog summary for display; null when unassigned (Blogs v1.13). */
  blog: { slug: string; name: string } | null;
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
