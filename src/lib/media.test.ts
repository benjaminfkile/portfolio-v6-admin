import { describe, it, expect } from 'vitest';
import {
  ORPHAN_GRACE_DAYS,
  formatBytes,
  isImage,
  isOrphaned,
  isVideo,
  mediaUrl,
  scheduledDeletionDate,
} from './media';

describe('media helpers', () => {
  it('scheduledDeletionDate is unreferenced_at + 7 days for orphans, null otherwise (§6.9)', () => {
    expect(scheduledDeletionDate({ unreferenced_at: null })).toBeNull();
    const d = scheduledDeletionDate({ unreferenced_at: '2026-07-20T00:00:00Z' });
    expect(d).not.toBeNull();
    const expected = new Date('2026-07-20T00:00:00Z');
    expected.setDate(expected.getDate() + ORPHAN_GRACE_DAYS);
    expect(d?.getTime()).toBe(expected.getTime());
  });

  it('isOrphaned reflects the unreferenced_at column', () => {
    expect(isOrphaned({ unreferenced_at: '2026-07-20T00:00:00Z' })).toBe(true);
    expect(isOrphaned({ unreferenced_at: null })).toBe(false);
  });

  it('formatBytes renders human-readable sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1_572_864)).toBe('1.5 MB');
    expect(formatBytes(-1)).toBe('—');
  });

  it('mediaUrl prefers the resolved CDN url, then falls back to the raw key (§6.8)', () => {
    expect(mediaUrl({ url: 'https://cdn/x.png', s3_key: 'media/x.png' })).toBe('https://cdn/x.png');
    // No url and no VITE_CDN_URL configured in the test env => raw key.
    expect(mediaUrl({ s3_key: 'media/x.png' })).toBe('media/x.png');
  });

  it('classifies image vs video by mime', () => {
    expect(isImage({ mime: 'image/png' })).toBe(true);
    expect(isImage({ mime: 'video/mp4' })).toBe(false);
    expect(isVideo({ mime: 'video/mp4' })).toBe(true);
  });
});
