import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import apiClient from './apiClient';
import { s3Client } from './mediaApi';
import {
  ResumeUploadError,
  confirmResumeUpload,
  deleteResume,
  getResumes,
  isPdfFile,
  performResumeUpload,
  requestResumeUploadUrl,
} from './resumesApi';
import { getIdToken } from '../lib/cognitoClient';

vi.mock('../lib/cognitoClient');
vi.mocked(getIdToken).mockResolvedValue('test-token');

const api = new MockAdapter(apiClient);
const s3 = new MockAdapter(s3Client);

const ok = <T>(data: T) => ({ status: 'ok', error: false, data });

const PINNED_HEADERS = {
  'Content-Type': 'application/pdf',
  'Cache-Control': 'public, max-age=31536000, immutable',
};
const PRESIGNED_URL = 'https://s3.example.com/bucket/resumes/uuid/resume.pdf?X-Amz-Signature=abc';

function pdfFile(name = 'resume.pdf', type = 'application/pdf') {
  return new File(['fake-pdf-bytes'], name, { type });
}

beforeEach(() => {
  api.reset();
  s3.reset();
});

afterEach(() => {
  api.reset();
  s3.reset();
});

describe('resumesApi — three-step PDF upload', () => {
  it('runs request → PUT → confirm in order with the pinned Content-Type', async () => {
    api.onPost('/api/admin/resumes/upload-url').reply(
      200,
      ok({
        id: 'r1',
        s3_key: 'resumes/uuid/resume.pdf',
        upload_url: PRESIGNED_URL,
        upload_headers: PINNED_HEADERS,
        expires_in: 900,
      }),
    );
    s3.onPut(PRESIGNED_URL).reply(200);
    api.onPost('/api/admin/resumes/r1/confirm').reply(
      200,
      ok({
        id: 'r1',
        filename: 'resume.pdf',
        s3_key: 'resumes/uuid/resume.pdf',
        url: 'https://cdn.example.com/resumes/uuid/resume.pdf',
        bytes: 14,
        confirmed_at: '2026-08-17T00:00:00Z',
        created_at: '2026-08-17T00:00:00Z',
      }),
    );

    const version = await performResumeUpload(pdfFile());

    // Step 1: request carried filename + size only (no MIME parameter needed).
    expect(api.history.post[0].url).toBe('/api/admin/resumes/upload-url');
    expect(JSON.parse(api.history.post[0].data)).toEqual({
      filename: 'resume.pdf',
      size: 14,
    });

    // Step 2: bytes went to S3, not via the gateway, with pinned headers verbatim.
    expect(s3.history.put).toHaveLength(1);
    expect(s3.history.put[0].url).toBe(PRESIGNED_URL);
    expect(s3.history.put[0].headers?.['Content-Type']).toBe('application/pdf');
    expect(s3.history.put[0].headers?.['Cache-Control']).toBe(
      'public, max-age=31536000, immutable',
    );
    // The direct S3 PUT must NOT carry the admin bearer token.
    expect(s3.history.put[0].headers?.['Authorization']).toBeUndefined();

    // Step 3: confirm on the row id from step 1; the confirmed version returns.
    expect(api.history.post[1].url).toBe('/api/admin/resumes/r1/confirm');
    expect(version.id).toBe('r1');
    expect(version.confirmed_at).toBe('2026-08-17T00:00:00Z');
  });

  it('rejects non-PDF files client-side before any request is made', async () => {
    const png = new File(['not-a-pdf'], 'photo.png', { type: 'image/png' });

    await expect(performResumeUpload(png)).rejects.toBeInstanceOf(ResumeUploadError);
    // No API call, no S3 PUT.
    expect(api.history.post).toHaveLength(0);
    expect(s3.history.put).toHaveLength(0);
  });

  it('accepts a .pdf file whose type is empty by falling back to the extension', () => {
    expect(isPdfFile(new File([''], 'r.pdf', { type: '' }))).toBe(true);
    expect(isPdfFile(new File([''], 'r.PDF', { type: '' }))).toBe(true);
    expect(isPdfFile(new File([''], 'r.txt', { type: '' }))).toBe(false);
    expect(isPdfFile(new File([''], 'r.pdf', { type: 'application/pdf' }))).toBe(true);
    expect(isPdfFile(new File([''], 'r.png', { type: 'image/png' }))).toBe(false);
  });

  it('surfaces a 403 on the PUT as a Content-Type mismatch hint', async () => {
    api.onPost('/api/admin/resumes/upload-url').reply(
      200,
      ok({
        id: 'r2',
        s3_key: 'resumes/uuid/resume.pdf',
        upload_url: PRESIGNED_URL,
        upload_headers: PINNED_HEADERS,
        expires_in: 900,
      }),
    );
    s3.onPut(PRESIGNED_URL).reply(403);

    let caught: unknown;
    try {
      await performResumeUpload(pdfFile());
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ResumeUploadError);
    const e = caught as ResumeUploadError;
    expect(e.step).toBe('upload');
    expect(e.status).toBe(403);
    expect(e.message).toMatch(/content-type/i);
    // Confirm never runs if the PUT failed.
    expect(api.history.post.some((r) => r.url?.endsWith('/confirm'))).toBe(false);
  });

  it('tags a failed upload-url request as the "request" step', async () => {
    api.onPost('/api/admin/resumes/upload-url').reply(500, {
      status: 'error',
      error: true,
      errorMsg: 'boom',
    });

    await expect(
      requestResumeUploadUrl({ filename: 'r.pdf', size: 1 }),
    ).rejects.toMatchObject({ name: 'ResumeUploadError', step: 'request' });
    expect(s3.history.put).toHaveLength(0);
  });

  it('confirmResumeUpload posts to the row confirm route and unwraps the version', async () => {
    api.onPost('/api/admin/resumes/r9/confirm').reply(
      200,
      ok({
        id: 'r9',
        filename: 'r.pdf',
        s3_key: 'k',
        bytes: 3,
        confirmed_at: 'now',
        created_at: 'now',
      }),
    );
    const v = await confirmResumeUpload('r9');
    expect(v.id).toBe('r9');
  });
});

describe('resumesApi — list and delete', () => {
  it('getResumes unwraps the versions list', async () => {
    api.onGet('/api/admin/resumes').reply(
      200,
      ok({
        resumes: [
          {
            id: 'r1',
            filename: 'a.pdf',
            s3_key: 'k1',
            bytes: 1,
            confirmed_at: 'now',
            created_at: 'now',
          },
        ],
      }),
    );
    const list = await getResumes();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('r1');
  });

  it('deleteResume issues a DELETE to the row', async () => {
    api.onDelete('/api/admin/resumes/r1').reply(200, ok({}));
    await deleteResume('r1');
    expect(api.history.delete[0].url).toBe('/api/admin/resumes/r1');
  });
});
