/**
 * Pure helpers for the post block model (§3.7). The block editor holds the `Block[]` in
 * memory and saves it wholesale (§4.2 — blocks are not individually addressable endpoints),
 * so insertion, deletion, and reorder are plain array operations. Keeping them here — free
 * of React and dnd-kit — lets the array logic be unit-tested directly without simulating
 * pointer drags in jsdom, exactly as `reorder.ts` does for the section flows.
 */
import type { Block, BlockType } from '../types/content';
import { DEFAULT_CODE_LANGUAGE } from './codeLanguages';

/**
 * A fresh block of `type` with sensible empty defaults. The discriminated union means each
 * type seeds a different shape; optional fields (`filename`, `caption`, `attribution`) start
 * absent rather than as empty strings so an untouched block serializes without noise.
 */
export function newBlock(type: BlockType): Block {
  switch (type) {
    case 'heading':
      return { type: 'heading', level: 2, text: '' };
    case 'paragraph':
      return { type: 'paragraph', text: '' };
    case 'code':
      return { type: 'code', language: DEFAULT_CODE_LANGUAGE, code: '' };
    case 'media':
      return { type: 'media', media_id: '' };
    case 'list':
      return { type: 'list', ordered: false, items: [] };
    case 'quote':
      return { type: 'quote', text: '' };
    case 'links':
      return { type: 'links', links: [] };
    case 'divider':
      return { type: 'divider' };
    default: {
      // Exhaustiveness guard: a new BlockType must add a case above.
      const never: never = type;
      throw new Error(`Unknown block type: ${String(never)}`);
    }
  }
}

/** Append a fresh block of `type` to the array, returning a new array (§3.7). */
export function addBlock(blocks: Block[], type: BlockType): Block[] {
  return [...blocks, newBlock(type)];
}

/** Remove the block at `index`, returning a new array. Out-of-range index is a no-op copy. */
export function removeBlockAt(blocks: Block[], index: number): Block[] {
  return blocks.filter((_, i) => i !== index);
}

/** Replace the block at `index` with `block`, returning a new array. */
export function updateBlockAt(blocks: Block[], index: number, block: Block): Block[] {
  return blocks.map((b, i) => (i === index ? block : b));
}

/**
 * Move the block at `from` to `to`, returning a new array. Out-of-range indices or a no-op
 * move return a copy unchanged. Used by the pure tests; the live drag flow goes through
 * {@link reorderBlocksByIds} because dnd hands back a full ordered id array (§4.2).
 */
export function moveBlock(blocks: Block[], from: number, to: number): Block[] {
  if (
    from < 0 ||
    from >= blocks.length ||
    to < 0 ||
    to >= blocks.length ||
    from === to
  ) {
    return [...blocks];
  }
  const next = [...blocks];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Rebuild the array from a full ordered id list, where each id is the stringified original
 * index (blocks have no id of their own — like Links, they are never addressed
 * independently, §3.7). This is the shape {@link SortableList} produces on drop.
 */
export function reorderBlocksByIds(blocks: Block[], orderedIds: string[]): Block[] {
  return orderedIds.map((id) => blocks[Number(id)]).filter((b): b is Block => Boolean(b));
}

/** A one-line summary of a block for the collapsed row header (best-effort, never throws). */
export function blockSummary(block: Block): string {
  switch (block.type) {
    case 'heading':
      return block.text || 'Empty heading';
    case 'paragraph':
      return block.text || 'Empty paragraph';
    case 'code':
      return block.filename || `${block.language} snippet`;
    case 'media':
      return block.caption || (block.media_id ? 'Media' : 'No media selected');
    case 'list':
      return `${block.items.length} item${block.items.length === 1 ? '' : 's'}`;
    case 'quote':
      return block.text || 'Empty quote';
    case 'links':
      return `${block.links.length} link${block.links.length === 1 ? '' : 's'}`;
    case 'divider':
      return 'Divider';
    default:
      return '';
  }
}
