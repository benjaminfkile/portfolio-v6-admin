import { describe, it, expect } from 'vitest';
import {
  addBlock,
  blockSummary,
  moveBlock,
  newBlock,
  removeBlockAt,
  reorderBlocksByIds,
  updateBlockAt,
} from './blocks';
import type { Block, BlockType } from '../types/content';

const ALL_TYPES: BlockType[] = [
  'heading',
  'paragraph',
  'code',
  'media',
  'list',
  'quote',
  'links',
  'divider',
];

describe('newBlock — one fresh block per type (§3.7)', () => {
  it.each(ALL_TYPES)('creates a %s block with the right discriminant', (type) => {
    expect(newBlock(type).type).toBe(type);
  });

  it('seeds sensible empty defaults and omits optional fields', () => {
    expect(newBlock('code')).toEqual({ type: 'code', language: 'text', code: '' });
    expect(newBlock('list')).toEqual({ type: 'list', ordered: false, items: [] });
    expect(newBlock('media')).toEqual({ type: 'media', media_id: '' });
    // Optional filename/caption/attribution start absent, not empty strings.
    expect('filename' in newBlock('code')).toBe(false);
    expect('caption' in newBlock('media')).toBe(false);
  });
});

describe('array operations — add / update / delete (§3.7, §4.2)', () => {
  const base: Block[] = [
    { type: 'heading', level: 2, text: 'A' },
    { type: 'paragraph', text: 'B' },
  ];

  it('addBlock appends without mutating the input', () => {
    const next = addBlock(base, 'divider');
    expect(next).toHaveLength(3);
    expect(next[2]).toEqual({ type: 'divider' });
    expect(base).toHaveLength(2); // original untouched
  });

  it('removeBlockAt drops exactly one block', () => {
    const next = removeBlockAt(base, 0);
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({ type: 'paragraph', text: 'B' });
  });

  it('removeBlockAt is a no-op copy for an out-of-range index', () => {
    const next = removeBlockAt(base, 9);
    expect(next).toEqual(base);
    expect(next).not.toBe(base);
  });

  it('updateBlockAt replaces one block in place', () => {
    const next = updateBlockAt(base, 1, { type: 'paragraph', text: 'edited' });
    expect(next[1]).toEqual({ type: 'paragraph', text: 'edited' });
    expect(next[0]).toBe(base[0]);
  });
});

describe('reorder — moveBlock and reorderBlocksByIds (§4.2, §14.4)', () => {
  const base: Block[] = [
    { type: 'heading', level: 2, text: 'A' },
    { type: 'paragraph', text: 'B' },
    { type: 'divider' },
  ];

  it('moveBlock moves an entry to a new slot', () => {
    const next = moveBlock(base, 0, 2);
    expect(next.map((b) => (b.type === 'divider' ? 'D' : (b as { text: string }).text))).toEqual([
      'B',
      'D',
      'A',
    ]);
  });

  it('moveBlock is a no-op copy for out-of-range or same index', () => {
    expect(moveBlock(base, 1, 1)).toEqual(base);
    expect(moveBlock(base, -1, 0)).toEqual(base);
    expect(moveBlock(base, 0, 9)).toEqual(base);
  });

  it('reorderBlocksByIds rebuilds from a full ordered id array (the dnd drop shape)', () => {
    // ids are stringified original indices; SortableList hands back the full new order.
    const next = reorderBlocksByIds(base, ['2', '0', '1']);
    expect(next.map((b) => b.type)).toEqual(['divider', 'heading', 'paragraph']);
  });
});

describe('blockSummary — best-effort row label', () => {
  it('summarises each type without throwing', () => {
    expect(blockSummary({ type: 'heading', level: 2, text: 'Hi' })).toBe('Hi');
    expect(blockSummary({ type: 'code', language: 'ts', code: '' })).toBe('ts snippet');
    expect(blockSummary({ type: 'code', language: 'ts', code: '', filename: 'a.ts' })).toBe('a.ts');
    expect(blockSummary({ type: 'list', ordered: true, items: ['x', 'y'] })).toBe('2 items');
    expect(blockSummary({ type: 'links', links: [] })).toBe('0 links');
    expect(blockSummary({ type: 'divider' })).toBe('Divider');
  });
});
