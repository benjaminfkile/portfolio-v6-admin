import { afterEach, describe, expect, it, vi } from 'vitest';
import { pagePreviewUrl, postPreviewUrl } from './previewUrl';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('previewUrl — the §7 iframe URL contract', () => {
  it('composes the page preview as `<site>/?preview=<token>`', () => {
    vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://public.example.com');
    expect(pagePreviewUrl('tok-123')).toBe('https://public.example.com/?preview=tok-123');
  });

  it('composes the post preview as `<site>/blog/<slug>?preview=<token>&postId=<id>` verbatim', () => {
    vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://public.example.com');
    expect(postPreviewUrl('my-post', 'tok-abc', 'p1')).toBe(
      'https://public.example.com/blog/my-post?preview=tok-abc&postId=p1',
    );
  });

  it('trims a trailing slash on the site base so it never doubles up', () => {
    vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://public.example.com/');
    expect(pagePreviewUrl('t')).toBe('https://public.example.com/?preview=t');
    expect(postPreviewUrl('s', 't', 'id')).toBe(
      'https://public.example.com/blog/s?preview=t&postId=id',
    );
  });

  it('percent-encodes the dynamic parts so an odd token/slug cannot break the URL', () => {
    vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://public.example.com');
    expect(pagePreviewUrl('a b&c')).toBe('https://public.example.com/?preview=a%20b%26c');
    expect(postPreviewUrl('a/b', 't&k', 'p 1')).toBe(
      'https://public.example.com/blog/a%2Fb?preview=t%26k&postId=p%201',
    );
  });
});
