import { describe, it, expect } from 'vitest';
import { reorderIds, isValidLinkUrl, normalizeLinkUrl, validateLink, areLinksValid } from './reorder';
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

describe('isValidLinkUrl', () => {
  it('accepts http and https', () => {
    expect(isValidLinkUrl('http://example.com')).toBe(true);
    expect(isValidLinkUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('accepts mailto: and tel: (contact-link protocols)', () => {
    expect(isValidLinkUrl('mailto:a@b.com')).toBe(true);
    expect(isValidLinkUrl('tel:+14065551234')).toBe(true);
    expect(isValidLinkUrl('tel:4065551234')).toBe(true);
  });

  it('rejects javascript:, data:, ftp: and garbage', () => {
    expect(isValidLinkUrl('javascript:alert(1)')).toBe(false);
    expect(isValidLinkUrl('data:text/html,<script>')).toBe(false);
    expect(isValidLinkUrl('ftp://example.com')).toBe(false);
    expect(isValidLinkUrl('not a url')).toBe(false);
    expect(isValidLinkUrl('')).toBe(false);
  });
});

describe('normalizeLinkUrl', () => {
  it('leaves already-prefixed URLs untouched', () => {
    expect(normalizeLinkUrl('https://example.com')).toBe('https://example.com');
    expect(normalizeLinkUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeLinkUrl('mailto:ben@example.com')).toBe('mailto:ben@example.com');
    expect(normalizeLinkUrl('tel:+14065551234')).toBe('tel:+14065551234');
  });

  it('does not rewrite explicit schemes even when invalid (validation catches them)', () => {
    expect(normalizeLinkUrl('javascript:alert(1)')).toBe('javascript:alert(1)');
    expect(normalizeLinkUrl('data:text/html,<script>')).toBe('data:text/html,<script>');
  });

  it('auto-prefixes a bare email with mailto:', () => {
    expect(normalizeLinkUrl('ben@example.com')).toBe('mailto:ben@example.com');
    expect(normalizeLinkUrl('  ben@example.com  ')).toBe('mailto:ben@example.com');
    expect(normalizeLinkUrl('first.last+tag@sub.example.co.uk')).toBe(
      'mailto:first.last+tag@sub.example.co.uk',
    );
  });

  it('auto-prefixes a bare phone number with tel: and strips display characters', () => {
    expect(normalizeLinkUrl('(406) 555-1234')).toBe('tel:4065551234');
    expect(normalizeLinkUrl('+1 (406) 555-1234')).toBe('tel:+14065551234');
    expect(normalizeLinkUrl('406-555-1234')).toBe('tel:4065551234');
    expect(normalizeLinkUrl('  555.1234  ')).toBe('tel:5551234');
  });

  it('returns other input trimmed but unchanged (validation flags it)', () => {
    expect(normalizeLinkUrl('  example.com  ')).toBe('example.com');
    expect(normalizeLinkUrl('not a url')).toBe('not a url');
    expect(normalizeLinkUrl('')).toBe('');
    // A single digit is not a plausible phone number.
    expect(normalizeLinkUrl('1')).toBe('1');
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

  it('flags a non-allowlisted url scheme', () => {
    expect(validateLink({ ...good, url: 'javascript:alert(1)' }).url).toBeTruthy();
    expect(validateLink({ ...good, url: 'data:text/html,<script>' }).url).toBeTruthy();
    expect(validateLink({ ...good, url: 'ftp://example.com' }).url).toBeTruthy();
  });

  it('accepts mailto:, tel:, and bare email/phone (normalized before validation)', () => {
    expect(validateLink({ ...good, url: 'mailto:ben@example.com' })).toEqual({});
    expect(validateLink({ ...good, url: 'tel:+14065551234' })).toEqual({});
    expect(validateLink({ ...good, url: 'ben@example.com' })).toEqual({});
    expect(validateLink({ ...good, url: '(406) 555-1234' })).toEqual({});
  });

  it('areLinksValid is false when any link is invalid', () => {
    expect(areLinksValid([good, { ...good, label: '' }])).toBe(false);
  });
});
