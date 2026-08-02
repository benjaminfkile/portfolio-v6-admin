import { describe, it, expect, afterEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import apiClient from './apiClient';
import {
  ConflictError,
  createItem,
  createSection,
  deleteSection,
  getSections,
  reorderItems,
  reorderSections,
  updateItem,
  updateSection,
} from './sectionsApi';
import { getIdToken } from '../lib/cognitoClient';

vi.mock('../lib/cognitoClient');
vi.mocked(getIdToken).mockResolvedValue('test-token');

const mock = new MockAdapter(apiClient);

afterEach(() => {
  mock.reset();
});

const ok = <T>(data: T) => ({ status: 'ok', error: false, data });

describe('sectionsApi — reads and writes', () => {
  it('getSections unwraps the response envelope', async () => {
    mock.onGet('/api/admin/sections').reply(200, ok({ sections: [{ id: 's1', type: 'hero' }] }));
    const sections = await getSections();
    expect(sections).toEqual([{ id: 's1', type: 'hero' }]);
  });

  it('getSections scopes the list to a page via ?page_id= (§3.10)', async () => {
    mock.onGet('/api/admin/sections').reply(200, ok({ sections: [] }));
    await getSections('p1');
    expect(mock.history.get[0].params).toEqual({ page_id: 'p1' });
  });

  it('createSection posts the type, default data, and owning page_id (§3.10)', async () => {
    mock.onPost('/api/admin/sections').reply(200, ok({ id: 's9', type: 'about' }));
    await createSection('about', { body: '' }, 'p1');
    expect(JSON.parse(mock.history.post[0].data)).toEqual({
      type: 'about',
      data: { body: '' },
      page_id: 'p1',
    });
  });

  it('deleteSection issues a DELETE to the row', async () => {
    mock.onDelete('/api/admin/sections/s1').reply(200, ok({}));
    await deleteSection('s1');
    expect(mock.history.delete[0].url).toBe('/api/admin/sections/s1');
  });
});

describe('sectionsApi — reorder emits the full ordered id array (§4.2)', () => {
  it('reorderSections PUTs the complete { page_id, ids } array scoped to the page (§3.10)', async () => {
    mock.onPut('/api/admin/sections/order').reply(200, ok({}));
    await reorderSections('p1', ['c', 'a', 'b']);

    expect(mock.history.put).toHaveLength(1);
    expect(mock.history.put[0].url).toBe('/api/admin/sections/order');
    expect(JSON.parse(mock.history.put[0].data)).toEqual({ page_id: 'p1', ids: ['c', 'a', 'b'] });
  });

  it('reorderItems PUTs the full ids array scoped to the section', async () => {
    mock.onPut('/api/admin/sections/s1/items/order').reply(200, ok({}));
    await reorderItems('s1', ['i3', 'i1', 'i2']);

    expect(JSON.parse(mock.history.put[0].data)).toEqual({ ids: ['i3', 'i1', 'i2'] });
  });
});

describe('sectionsApi — optimistic concurrency (§4.5)', () => {
  it('updateSection sends expected_updated_at', async () => {
    mock.onPatch('/api/admin/sections/s1').reply(200, ok({ id: 's1' }));
    await updateSection('s1', { data: { title: 'Hi' }, expected_updated_at: '2026-01-01T00:00:00Z' });

    const body = JSON.parse(mock.history.patch[0].data);
    expect(body.expected_updated_at).toBe('2026-01-01T00:00:00Z');
    expect(body.data).toEqual({ title: 'Hi' });
  });

  it('updateSection moves a section by PATCHing page_id (§3.10)', async () => {
    mock.onPatch('/api/admin/sections/s1').reply(200, ok({ id: 's1', page_id: 'p2' }));
    await updateSection('s1', { page_id: 'p2', expected_updated_at: '2026-01-01T00:00:00Z' });

    const body = JSON.parse(mock.history.patch[0].data);
    expect(body.page_id).toBe('p2');
    expect(body.expected_updated_at).toBe('2026-01-01T00:00:00Z');
  });

  it('updateSection throws ConflictError on 409', async () => {
    mock.onPatch('/api/admin/sections/s1').reply(409, { status: 'error', error: true });
    await expect(
      updateSection('s1', { data: {}, expected_updated_at: 'stale' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('updateItem throws ConflictError on 409', async () => {
    mock.onPatch('/api/admin/items/i1').reply(409, { status: 'error', error: true });
    await expect(
      updateItem('i1', { data: {}, expected_updated_at: 'stale' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('updateSection re-throws non-409 errors untouched', async () => {
    mock.onPatch('/api/admin/sections/s1').reply(500, { status: 'error', error: true });
    await expect(
      updateSection('s1', { data: {}, expected_updated_at: 'x' }),
    ).rejects.not.toBeInstanceOf(ConflictError);
  });

  it('createItem posts data to the section items route', async () => {
    mock.onPost('/api/admin/sections/s1/items').reply(200, ok({ id: 'i1' }));
    await createItem('s1', { title: 'New' });
    expect(mock.history.post[0].url).toBe('/api/admin/sections/s1/items');
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ data: { title: 'New' } });
  });
});
