/**
 * Admin block registry (§3.7, mirroring `sectionRegistry.ts`). The public site holds a
 * *rendering* `BLOCK_REGISTRY` keyed by `type`; the admin holds this parallel *editing*
 * registry that labels each of the 8 block types for the add-block menu and the collapsed
 * row header. Most per-type editors are generated from the block shape; three are bespoke
 * (code, media, links — §3.7) and are dispatched in the block editor by `type`.
 *
 * Declarative and JSX-free so it can be imported by both the editor and its tests.
 */
import type { BlockType } from '../types/content';

export interface BlockTypeDef {
  type: BlockType;
  /** Menu label, e.g. "Heading", "Code". */
  label: string;
  /** One-line description shown in the add-block menu. */
  description: string;
}

export const BLOCK_TYPES: Record<BlockType, BlockTypeDef> = {
  heading: {
    type: 'heading',
    label: 'Heading',
    description: 'Section heading (H2–H4).',
  },
  paragraph: {
    type: 'paragraph',
    label: 'Paragraph',
    description: 'Body text with constrained inline markdown.',
  },
  code: {
    type: 'code',
    label: 'Code',
    description: 'A syntax-highlighted code snippet with optional filename.',
  },
  media: {
    type: 'media',
    label: 'Media',
    description: 'An image or video from the library, with a caption.',
  },
  list: {
    type: 'list',
    label: 'List',
    description: 'An ordered or unordered list.',
  },
  quote: {
    type: 'quote',
    label: 'Quote',
    description: 'A block quote with optional attribution.',
  },
  links: {
    type: 'links',
    label: 'Links',
    description: 'A group of outbound links (repo, prod, docs…).',
  },
  divider: {
    type: 'divider',
    label: 'Divider',
    description: 'A horizontal rule between sections.',
  },
};

/** Ordered list of every block type, for the add-block menu (§3.7). */
export const BLOCK_TYPE_LIST: BlockTypeDef[] = Object.values(BLOCK_TYPES);

export function getBlockTypeDef(type: BlockType): BlockTypeDef {
  return BLOCK_TYPES[type];
}

/**
 * Helper text shown under the plain-text editors (paragraph/list/quote/heading). Inline
 * formatting there is a constrained markdown subset — bold, italic, inline code, links —
 * and raw HTML is never stored or rendered (§3.7).
 */
export const INLINE_MARKDOWN_HELP =
  'Inline formatting is a constrained markdown subset: **bold**, *italic*, `inline code`, ' +
  'and [links](url). No HTML.';
