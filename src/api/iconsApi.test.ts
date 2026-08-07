import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import apiClient from './apiClient';
import {
  deviconPreviewUrl,
  getDeviconManifest,
  importIcon,
  searchIcons,
  type DeviconIcon,
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
