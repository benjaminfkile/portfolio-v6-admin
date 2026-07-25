import { describe, it, expect } from 'vitest';
import { reorderIds, isValidHttpUrl, validateLink, areLinksValid } from './reorder';
import type { Link } from '../types/content';

describe('reorderIds', () => {
  it('moves an item forward, returning the full array', () => {
    expect(reorderIds(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item backward, returning the full array', () => {
    expect(reorderIds(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });

  it('is a no-op (copy) when active and over are the same', () => {
    const ids = ['a', 'b', 'c'];
    const result = reorderIds(ids, 'b', 'b');
    expect(result).toEqual(ids);
    expect(result).not.toBe(ids);
  });

  it('returns an unchanged copy when an id is unknown', () => {
    expect(reorderIds(['a', 'b'], 'x', 'a')).toEqual(['a', 'b']);
  });

  it('preserves every id (no drops or dupes) on any move', () => {
    const ids = ['1', '2', '3', '4', '5'];
    const result = reorderIds(ids, '5', '1');
    expect([...result].sort()).toEqual([...ids].sort());
    expect(result).toHaveLength(ids.length);
  });
});

describe('isValidHttpUrl', () => {
  it('accepts http and https', () => {
    expect(isValidHttpUrl('http://example.com')).toBe(true);
    expect(isValidHttpUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('rejects javascript:, data:, mailto:, ftp: and garbage', () => {
    expect(isValidHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isValidHttpUrl('data:text/html,<script>')).toBe(false);
    expect(isValidHttpUrl('mailto:a@b.com')).toBe(false);
    expect(isValidHttpUrl('ftp://example.com')).toBe(false);
    expect(isValidHttpUrl('not a url')).toBe(false);
    expect(isValidHttpUrl('')).toBe(false);
  });
});

describe('validateLink / areLinksValid', () => {
  const good: Link = { type: 'repo', label: 'API', url: 'https://example.com' };

  it('passes a well-formed link', () => {
    expect(validateLink(good)).toEqual({});
    expect(areLinksValid([good])).toBe(true);
  });

  it('flags a missing/whitespace label', () => {
    expect(validateLink({ ...good, label: '   ' }).label).toBeTruthy();
  });

  it('flags a non-http(s) url', () => {
    expect(validateLink({ ...good, url: 'javascript:alert(1)' }).url).toBeTruthy();
  });

  it('areLinksValid is false when any link is invalid', () => {
    expect(areLinksValid([good, { ...good, label: '' }])).toBe(false);
  });
});
