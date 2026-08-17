/**
 * Admin section registry (§3.4, §3.9 item 2). The public site holds a *rendering*
 * registry keyed by `type`; the admin holds this parallel *editing* registry that
 * describes the fields of each section type's `data` blob and, for the item-bearing
 * types, the fields of each `section_items.data` blob. The section and item edit forms
 * are generated from these descriptors, so adding a section type is one registry entry
 * rather than a bespoke hand-written form.
 *
 * The field list per type is the §3.4 table transcribed. Kept deliberately declarative:
 * no JSX here, so it can be imported by both forms and tests.
 */
import type { SectionType } from '../types/content';
import type { ItemData, SectionData } from '../types/admin';

export type FieldKind =
  | 'text'
  | 'multiline'
  | 'number'
  | 'boolean'
  | 'select'
  | 'blogSlug'
  | 'media'
  | 'icon'
  | 'links'
  | 'skillRefs'
  | 'postRefs'
  | 'stringList';

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** Options for `select` fields. */
  options?: { value: string; label: string }[];
  helperText?: string;
  /** Bounds for `number` fields — enforced client-side so an out-of-range
   *  value is caught in the form, not as an opaque server reject. The API's
   *  zod schemas remain the authority; these mirror them. */
  min?: number;
  max?: number;
  /** `number` fields that must be whole numbers (mirrors `z.int()`). */
  integer?: boolean;
  /**
   * `icon` fields only: marks this as the DARK-theme override field. It flips the picker into
   * its tint-first mode (Simple Icons + ink presets), since devicon has no light variants of
   * its monochrome logos — the exact case a dark override exists for (Icons v1.6.1).
   */
  dark?: boolean;
  /**
   * `icon` fields only: the sibling key holding the light/default icon. When set on a `dark`
   * field, the picker pre-seeds its tint search with that icon's name so "same logo, tinted"
   * is one click.
   */
  lightSourceKey?: string;
}

export interface SectionTypeDef {
  type: SectionType;
  label: string;
  /** Whether this type owns repeatable `section_items` (§3.4). */
  hasItems: boolean;
  /** Fields of the section's own `data` blob. */
  fields: FieldDef[];
  /** Fields of each item's `data` blob (item-bearing types only). */
  itemFields?: FieldDef[];
  /** Singular noun for an item, e.g. "entry", "skill", "project". */
  itemNoun?: string;
  /** Sensible starting `data` for a freshly created section. */
  defaultData: SectionData;
  /** Sensible starting `data` for a freshly created item. */
  defaultItemData?: ItemData;
}

const LINK_HELPER = 'label is required; url can be http(s), mailto:, or tel: (bare emails and phone numbers are auto-prefixed)';

export const SECTION_TYPES: Record<SectionType, SectionTypeDef> = {
  hero: {
    type: 'hero',
    label: 'Hero',
    hasItems: false,
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'tagline', label: 'Tagline', kind: 'text' },
      { key: 'background_media_id', label: 'Background media', kind: 'media' },
    ],
    defaultData: { title: '' },
  },
  about: {
    type: 'about',
    label: 'About',
    hasItems: false,
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'body', label: 'Body', kind: 'multiline', required: true },
    ],
    defaultData: { body: '' },
  },
  timeline: {
    type: 'timeline',
    label: 'Timeline',
    hasItems: true,
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'intro', label: 'Intro', kind: 'multiline', helperText: 'Optional lead-in text shown under the heading' },
    ],
    itemNoun: 'entry',
    itemFields: [
      { key: 'date_range', label: 'Date range', kind: 'text', required: true },
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'description', label: 'Description', kind: 'multiline', required: true },
      { key: 'media_id', label: 'Media', kind: 'media' },
    ],
    defaultData: {},
    defaultItemData: { date_range: '', title: '', description: '' },
  },
  skills: {
    type: 'skills',
    label: 'Skills',
    hasItems: true,
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'intro', label: 'Intro', kind: 'multiline', helperText: 'Optional lead-in text shown under the heading' },
      {
        key: 'sphere_detail',
        label: 'Sphere detail (0–4)',
        kind: 'number',
        min: 0,
        max: 4,
        integer: true,
        helperText:
          'Geodesic sphere density — face count 20/80/180/320/500. ' +
          'Leave blank to auto-fit to the number of skills.',
      },
    ],
    itemNoun: 'skill',
    itemFields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'description', label: 'Description', kind: 'multiline', required: true },
      {
        key: 'icon_source',
        label: 'Icon',
        kind: 'icon',
        required: true,
        helperText: 'Default (light-theme) icon. Pick from devicon or enter a URL.',
      },
      {
        key: 'icon_source_dark',
        label: 'Dark theme icon',
        kind: 'icon',
        dark: true,
        lightSourceKey: 'icon_source',
        helperText:
          'A light-tinted version of the logo for the dark theme — most logos need this ' +
          'only if they are dark-coloured. Falls back to the default icon when empty.',
      },
    ],
    defaultData: {},
    defaultItemData: { title: '', description: '', icon_source: '' },
  },
  portfolio: {
    type: 'portfolio',
    label: 'Portfolio',
    hasItems: true,
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'intro', label: 'Intro', kind: 'multiline' },
    ],
    itemNoun: 'project',
    itemFields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'intro', label: 'Intro', kind: 'multiline' },
      { key: 'description', label: 'Description', kind: 'multiline', required: true },
      { key: 'media_id', label: 'Media', kind: 'media', required: true },
      { key: 'playback_rate', label: 'Playback rate', kind: 'number', min: 0.1 },
      { key: 'transform_value', label: 'Transform value', kind: 'text' },
      {
        key: 'skill_refs',
        label: 'Tech (from Skills)',
        kind: 'skillRefs',
        helperText:
          'References skills from the Skills section — icons and names always match the sphere.',
      },
      {
        key: 'post_refs',
        label: 'Related posts',
        kind: 'postRefs',
        helperText:
          'References blog posts by id (max 12). Drafts are allowed but stay hidden on the ' +
          'public site until published; a ref to a deleted post blocks publish.',
      },
      { key: 'links', label: 'Links', kind: 'links', helperText: LINK_HELPER },
    ],
    defaultData: {},
    defaultItemData: {
      title: '',
      intro: '',
      description: '',
      media_id: '',
      skill_refs: [],
      post_refs: [],
      links: [],
    },
  },
  status: {
    type: 'status',
    label: 'Status (live)',
    hasItems: false,
    fields: [
      { key: 'services', label: 'Services', kind: 'stringList' },
      { key: 'show_response_times', label: 'Show response times', kind: 'boolean' },
    ],
    defaultData: { services: [], show_response_times: false },
  },
  blog: {
    type: 'blog',
    label: 'Blog (live)',
    hasItems: false,
    fields: [
      { key: 'limit', label: 'Number of posts', kind: 'number', required: true, min: 1, integer: true },
      {
        key: 'blog',
        label: 'Blog',
        kind: 'blogSlug',
        helperText:
          'Optional — limit this section to one blog by its slug. Leave blank to show posts ' +
          'from all blogs. Publish fails if the selected blog slug no longer exists.',
      },
      { key: 'tag', label: 'Tag filter', kind: 'text' },
    ],
    defaultData: { limit: 3 },
  },
  now_playing: {
    type: 'now_playing',
    label: 'Now playing (live)',
    hasItems: false,
    fields: [
      {
        key: 'idle',
        label: 'Idle behavior',
        kind: 'select',
        required: true,
        options: [
          { value: 'hide', label: 'Hide the section' },
          { value: 'message', label: 'Show a message' },
        ],
      },
      { key: 'idle_message', label: 'Idle message', kind: 'text' },
      { key: 'show_album_art', label: 'Show album art', kind: 'boolean' },
    ],
    defaultData: { idle: 'hide', show_album_art: true },
  },
  duolingo: {
    type: 'duolingo',
    label: 'Duolingo (live)',
    hasItems: false,
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'intro', label: 'Intro', kind: 'multiline', helperText: 'Optional lead-in text shown under the heading' },
      {
        key: 'language',
        label: 'Course language',
        kind: 'text',
        required: true,
        helperText: 'Duolingo course code, e.g. "es" for Spanish',
      },
      {
        key: 'score_label',
        label: 'Score label',
        kind: 'text',
        helperText:
          'Hand-maintained — the official Duolingo Score is not exposed by the API. ' +
          'Update here when it changes, e.g. "Duolingo Score 95".',
      },
    ],
    defaultData: { language: 'es' },
  },
  github: {
    type: 'github',
    label: 'GitHub (live)',
    hasItems: false,
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'intro', label: 'Intro', kind: 'multiline', helperText: 'Optional lead-in text shown under the heading' },
    ],
    defaultData: {},
  },
  ops: {
    type: 'ops',
    label: 'Ops dashboard (live)',
    hasItems: false,
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'intro', label: 'Intro', kind: 'multiline', helperText: 'Optional lead-in text shown under the heading' },
    ],
    defaultData: {},
  },
  contact: {
    type: 'contact',
    label: 'Contact',
    hasItems: false,
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'body', label: 'Body', kind: 'multiline' },
      { key: 'links', label: 'Links', kind: 'links', helperText: LINK_HELPER },
    ],
    defaultData: {},
  },
};

/** Ordered list of every section type, for the create-section type picker. */
export const SECTION_TYPE_LIST: SectionTypeDef[] = Object.values(SECTION_TYPES);

export function getSectionTypeDef(type: SectionType): SectionTypeDef {
  return SECTION_TYPES[type];
}
