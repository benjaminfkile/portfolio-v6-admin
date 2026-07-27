import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import apiClient from './apiClient';
import {
  MediaUploadError,
  confirmUpload,
  deleteMedia,
  getMedia,
  performUpload,
  requestUploadUrl,
  runSweep,
  s3Client,
  uploadToS3,
} from './mediaApi';
import { getIdToken } from '../lib/cognitoClient';

vi.mock('../lib/cognitoClient');
vi.mocked(getIdToken).mockResolvedValue('test-token');

// Two adapters: `api` guards the authenticated gateway routes; `s3` guards the direct PUT.
// Keeping them separate proves the S3 PUT never rides the apiClient (and never gets the
// Authorization interceptor), exactly as §6.7 requires.
const api = new MockAdapter(apiClient);
const s3 = new MockAdapter(s3Client);

const ok = <T>(data: T) => ({ status: 'ok', error: false, data });

// The exact headers the API pins into the presigned signature (§6.7 step 2).
const PINNED_HEADERS = {
  'x-amz-tagging': 'state=pending',
  'Content-Type': 'image/png',
  'Cache-Control': 'public, max-age=31536000, immutable',
};
const PRESIGNED_URL = 'https://s3.example.com/bucket/media/uuid/photo.png?X-Amz-Signature=abc';

function pngFile(name = 'photo.png') {
  return new File(['fake-bytes'], name, { type: 'image/png' });
}

beforeEach(() => {
  api.reset();
  s3.reset();
});

afterEach(() => {
  api.reset();
  s3.reset();
});

describe('mediaApi — three-step upload (§6.7)', () => {
  it('runs request → tagged PUT → confirm in order with a byte-exact x-amz-tagging header', async () => {
    api.onPost('/api/admin/media/upload-url').reply(200, ok({
      id: 'm1',
      url: PRESIGNED_URL,
      headers: PINNED_HEADERS,
    }));
    s3.onPut(PRESIGNED_URL).reply(200);
    api.onPost('/api/admin/media/m1/confirm').reply(200, ok({
      id: 'm1',
      s3_key: 'media/uuid/photo.png',
      mime: 'image/png',
      bytes: 10,
      confirmed_at: '2026-07-25T00:00:00Z',
      unreferenced_at: null,
      created_at: '2026-07-25T00:00:00Z',
    }));

    const asset = await performUpload(pngFile(), { alt: 'A photo' });

    // Step 1: the upload-url request carried filename/mime/size/alt.
    expect(api.history.post[0].url).toBe('/api/admin/media/upload-url');
    expect(JSON.parse(api.history.post[0].data)).toEqual({
      filename: 'photo.png',
      mime: 'image/png',
      size: 10,
      alt: 'A photo',
    });

    // Step 2: the bytes went to the presigned S3 URL — NOT through the gateway — and the
    // x-amz-tagging header is byte-for-byte the value the API pinned into the signature.
    expect(s3.history.put).toHaveLength(1);
    expect(s3.history.put[0].url).toBe(PRESIGNED_URL);
    expect(s3.history.put[0].headers?.['x-amz-tagging']).toBe('state=pending');
    expect(s3.history.put[0].headers?.['x-amz-tagging']).toBe(PINNED_HEADERS['x-amz-tagging']);
    expect(s3.history.put[0].headers?.['Content-Type']).toBe('image/png');
    expect(s3.history.put[0].headers?.['Cache-Control']).toBe(
      'public, max-age=31536000, immutable',
    );
    // The S3 PUT must not carry the admin bearer token.
    expect(s3.history.put[0].headers?.['Authorization']).toBeUndefined();

    // Step 3: confirm was called on the row id from step 1, and the confirmed asset returns.
    expect(api.history.post[1].url).toBe('/api/admin/media/m1/confirm');
    expect(asset.id).toBe('m1');
    expect(asset.confirmed_at).toBe('2026-07-25T00:00:00Z');
  });

  it('surfaces a 403 on the PUT as a tagging-mismatch hint (§6.7 gotcha)', async () => {
    api.onPost('/api/admin/media/upload-url').reply(200, ok({
      id: 'm2',
      url: PRESIGNED_URL,
      headers: PINNED_HEADERS,
    }));
    s3.onPut(PRESIGNED_URL).reply(403);

    let caught: unknown;
    try {
      await performUpload(pngFile());
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MediaUploadError);
    const e = caught as MediaUploadError;
    expect(e.step).toBe('upload');
    expect(e.status).toBe(403);
    expect(e.message).toMatch(/x-amz-tagging/i);
    // Confirm must NOT be called if the PUT failed.
    expect(api.history.post.some((r) => r.url?.endsWith('/confirm'))).toBe(false);
  });

  it('tags a failed upload-url request as the "request" step', async () => {
    api.onPost('/api/admin/media/upload-url').reply(500, { status: 'error', error: true, errorMsg: 'boom' });

    await expect(requestUploadUrl({ filename: 'a.png', mime: 'image/png', size: 1 })).rejects.toMatchObject({
      name: 'MediaUploadError',
      step: 'request',
    });
    // The PUT never happens if we never got a URL.
    expect(s3.history.put).toHaveLength(0);
  });

  it('uploadToS3 sends the provided headers verbatim', async () => {
    s3.onPut(PRESIGNED_URL).reply(200);
    await uploadToS3(PRESIGNED_URL, PINNED_HEADERS, pngFile());
    expect(s3.history.put[0].headers?.['x-amz-tagging']).toBe('state=pending');
  });

  it('confirmUpload posts to the row confirm route and unwraps the asset', async () => {
    api.onPost('/api/admin/media/m9/confirm').reply(200, ok({ id: 'm9', s3_key: 'k', mime: 'image/png', bytes: 3, confirmed_at: 'now', unreferenced_at: null, created_at: 'now' }));
    const asset = await confirmUpload('m9');
    expect(asset.id).toBe('m9');
  });
});

describe('mediaApi — library reads, delete, sweep (§4.2, §6.9)', () => {
  it('getMedia unwraps the asset list', async () => {
    api.onGet('/api/admin/media').reply(200, ok({ assets: [{ id: 'm1' }, { id: 'm2' }] }));
    const assets = await getMedia();
    expect(assets).toHaveLength(2);
    expect(assets[0].id).toBe('m1');
  });

  it('deleteMedia issues a DELETE to the row', async () => {
    api.onDelete('/api/admin/media/m1').reply(200, ok({}));
    await deleteMedia('m1');
    expect(api.history.delete[0].url).toBe('/api/admin/media/m1');
  });

  it('runSweep posts to the sweep route and unwraps the summary', async () => {
    api.onPost('/api/admin/media/sweep').reply(200, ok({ orphaned: 2, rescued: 1, deleted: 0 }));
    const result = await runSweep();
    expect(api.history.post[0].url).toBe('/api/admin/media/sweep');
    expect(result).toEqual({ orphaned: 2, rescued: 1, deleted: 0 });
  });
});
