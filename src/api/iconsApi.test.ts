import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import apiClient from './apiClient';
import {
  deviconNameFromUrl,
  deviconPreviewUrl,
  getDeviconManifest,
  getSimpleIconsManifest,
  importIcon,
  importSimpleIcon,
  isValidHexColor,
  searchIcons,
  searchSimpleIcons,
  simpleIconPreviewUrl,
  type DeviconIcon,
  type SimpleIcon,
} from './iconsApi';
import { getIdToken } from '../lib/cognitoClient';

vi.mock('../lib/cognitoClient');
vi.mocked(getIdToken).mockResolvedValue('test-token');

const api = new MockAdapter(apiClient);
const ok = <T>(data: T) => ({ status: 'ok', error: false, data });

const ICONS: DeviconIcon[] = [
  { name: 'react', altnames: ['reactjs'], tags: ['framework', 'ui'], versions: ['original', 'plain', 'line'], color: '#61DAFB' },
  { name: 'postgresql', altnames: ['postgres'], tags: ['database', 'sql'], versions: ['original', 'plain', 'plain-wordmark'], color: '#336791' },
  { name: 'redis', altnames: [], tags: ['database', 'cache'], versions: ['original', 'plain-wordmark'], color: '#D82C20' },
];

beforeEach(() => api.reset());
afterEach(() => api.reset());

describe('iconsApi — manifest + import (Icons v1.6)', () => {
  it('getDeviconManifest unwraps the manifest envelope', async () => {
    api.onGet('/api/admin/icons/devicon-manifest').reply(200, ok({ version: 'v2.16.0', icons: ICONS }));
    const manifest = await getDeviconManifest();
    expect(api.history.get[0].url).toBe('/api/admin/icons/devicon-manifest');
    expect(manifest.version).toBe('v2.16.0');
    expect(manifest.icons).toHaveLength(3);
  });

  it('importIcon posts { name, variant } and returns the imported url', async () => {
    api
      .onPost('/api/admin/icons/import')
      .reply(200, ok({ url: 'https://cdn.example.com/icons/devicon/react-original@v2.16.0.svg' }));

    const url = await importIcon('react', 'original');

    expect(api.history.post[0].url).toBe('/api/admin/icons/import');
    expect(JSON.parse(api.history.post[0].data)).toEqual({ name: 'react', variant: 'original' });
    expect(url).toBe('https://cdn.example.com/icons/devicon/react-original@v2.16.0.svg');
  });

  it('surfaces a failed import as a rejection', async () => {
    api.onPost('/api/admin/icons/import').reply(400, { status: 'error', error: true, errorMsg: 'unknown variant' });
    await expect(importIcon('react', 'nope')).rejects.toBeTruthy();
  });
});

describe('searchIcons — name/altnames/tags filtering', () => {
  it('empty query returns everything', () => {
    expect(searchIcons(ICONS, '')).toHaveLength(3);
    expect(searchIcons(ICONS, '   ')).toHaveLength(3);
  });

  it('matches by name (case-insensitive)', () => {
    expect(searchIcons(ICONS, 'REACT').map((i) => i.name)).toEqual(['react']);
  });

  it('matches by altname', () => {
    expect(searchIcons(ICONS, 'postgres').map((i) => i.name)).toEqual(['postgresql']);
  });

  it('matches by tag, spanning multiple icons', () => {
    expect(searchIcons(ICONS, 'database').map((i) => i.name)).toEqual(['postgresql', 'redis']);
  });

  it('returns nothing for a miss', () => {
    expect(searchIcons(ICONS, 'nonexistent')).toHaveLength(0);
  });
});

describe('deviconPreviewUrl', () => {
  it('builds the pinned jsDelivr URL for a variant', () => {
    expect(deviconPreviewUrl('v2.16.0', 'react', 'original')).toBe(
      'https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/react/react-original.svg',
    );
  });
});

const SIMPLE_ICONS: SimpleIcon[] = [
  { slug: 'express', title: 'Express' },
  { slug: 'vercel', title: 'Vercel' },
  { slug: 'nextdotjs', title: 'Next.js' },
];

describe('Simple Icons — manifest + tinted import (Icons v1.6.1)', () => {
  it('getSimpleIconsManifest unwraps the manifest envelope', async () => {
    api
      .onGet('/api/admin/icons/simpleicons-manifest')
      .reply(200, ok({ version: '13.0.0', icons: SIMPLE_ICONS }));

    const manifest = await getSimpleIconsManifest();

    expect(api.history.get[0].url).toBe('/api/admin/icons/simpleicons-manifest');
    expect(manifest.version).toBe('13.0.0');
    expect(manifest.icons).toHaveLength(3);
  });

  it('importSimpleIcon posts the { source, slug, color } body and returns the url', async () => {
    api
      .onPost('/api/admin/icons/import')
      .reply(200, ok({ url: 'https://cdn.example.com/icons/simpleicons/express-EDF1F7.svg' }));

    const url = await importSimpleIcon('express', 'EDF1F7');

    expect(api.history.post[0].url).toBe('/api/admin/icons/import');
    expect(JSON.parse(api.history.post[0].data)).toEqual({
      source: 'simpleicons',
      slug: 'express',
      color: 'EDF1F7',
    });
    expect(url).toBe('https://cdn.example.com/icons/simpleicons/express-EDF1F7.svg');
  });

  it('surfaces a failed tinted import as a rejection', async () => {
    api
      .onPost('/api/admin/icons/import')
      .reply(400, { status: 'error', error: true, errorMsg: 'unknown slug' });
    await expect(importSimpleIcon('nope', 'EDF1F7')).rejects.toBeTruthy();
  });
});

describe('searchSimpleIcons — title/slug filtering', () => {
  it('empty query returns everything', () => {
    expect(searchSimpleIcons(SIMPLE_ICONS, '')).toHaveLength(3);
    expect(searchSimpleIcons(SIMPLE_ICONS, '  ')).toHaveLength(3);
  });

  it('matches by title (case-insensitive)', () => {
    expect(searchSimpleIcons(SIMPLE_ICONS, 'EXPRESS').map((i) => i.slug)).toEqual(['express']);
  });

  it('matches by slug', () => {
    expect(searchSimpleIcons(SIMPLE_ICONS, 'nextdot').map((i) => i.slug)).toEqual(['nextdotjs']);
  });
});

describe('simpleIconPreviewUrl', () => {
  it('builds the cdn.simpleicons.org tinted URL (hex without #)', () => {
    expect(simpleIconPreviewUrl('express', 'EDF1F7')).toBe(
      'https://cdn.simpleicons.org/express/EDF1F7',
    );
  });
});

describe('isValidHexColor', () => {
  it('accepts 3- and 6-digit hex without #', () => {
    expect(isValidHexColor('EDF1F7')).toBe(true);
    expect(isValidHexColor('fff')).toBe(true);
    expect(isValidHexColor('e8a33d')).toBe(true);
  });

  it('rejects #-prefixed, wrong-length, or non-hex values', () => {
    expect(isValidHexColor('#EDF1F7')).toBe(false);
    expect(isValidHexColor('EDF1F')).toBe(false);
    expect(isValidHexColor('nothex')).toBe(false);
    expect(isValidHexColor('')).toBe(false);
  });
});

describe('deviconNameFromUrl — tint search pre-seed', () => {
  it('extracts the devicon name from an imported light-icon URL', () => {
    expect(
      deviconNameFromUrl('https://cdn.example.com/icons/devicon/react-original@v2.16.0.svg'),
    ).toBe('react');
    expect(
      deviconNameFromUrl('https://cdn.example.com/icons/devicon/postgresql-plain-wordmark@v2.16.0.svg'),
    ).toBe('postgresql');
  });

  it('returns null for non-devicon URLs and empties', () => {
    expect(deviconNameFromUrl('https://cdn.simpleicons.org/express/EDF1F7')).toBeNull();
    expect(deviconNameFromUrl('')).toBeNull();
    expect(deviconNameFromUrl(undefined)).toBeNull();
  });
});
