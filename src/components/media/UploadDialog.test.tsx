import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import UploadDialog from './UploadDialog';
import apiClient from '../../api/apiClient';
import { s3Client } from '../../api/mediaApi';
import { getIdToken } from '../../lib/cognitoClient';

vi.mock('../../lib/cognitoClient');
vi.mocked(getIdToken).mockResolvedValue('test-token');

const api = new MockAdapter(apiClient);
const s3 = new MockAdapter(s3Client);
const ok = <T,>(data: T) => ({ status: 'ok', error: false, data });
const URL = 'https://s3.example.com/put?sig=1';
const HEADERS = {
  'x-amz-tagging': 'state=pending',
  'Content-Type': 'image/png',
  'Cache-Control': 'public, max-age=31536000, immutable',
};

beforeEach(() => {
  api.reset();
  s3.reset();
});
afterEach(() => {
  api.reset();
  s3.reset();
});

function selectFile() {
  return new File(['bytes'], 'pic.png', { type: 'image/png' });
}

describe('UploadDialog', () => {
  it('drives the full upload and reports the confirmed asset', async () => {
    const user = userEvent.setup();
    api.onPost('/api/admin/media/upload-url').reply(200, ok({ id: 'm1', s3_key: 'media/u/f.png', upload_url: URL, upload_headers: HEADERS, expires_in: 900 }));
    s3.onPut(URL).reply(200);
    api.onPost('/api/admin/media/m1/confirm').reply(200, ok({
      id: 'm1', s3_key: 'media/u/pic.png', mime: 'image/png', bytes: 5,
      confirmed_at: 'now', unreferenced_at: null, created_at: 'now',
    }));

    const onUploaded = vi.fn();
    render(<UploadDialog open onClose={() => {}} onUploaded={onUploaded} />);

    await user.upload(screen.getByLabelText(/file to upload/i), selectFile());
    await user.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(onUploaded.mock.calls[0][0].id).toBe('m1');
  });

  it('shows the tagging-mismatch hint when the PUT returns 403 (§6.7 gotcha)', async () => {
    const user = userEvent.setup();
    api.onPost('/api/admin/media/upload-url').reply(200, ok({ id: 'm2', s3_key: 'media/u/f.png', upload_url: URL, upload_headers: HEADERS, expires_in: 900 }));
    s3.onPut(URL).reply(403);

    render(<UploadDialog open onClose={() => {}} onUploaded={() => {}} />);
    await user.upload(screen.getByLabelText(/file to upload/i), selectFile());
    await user.click(screen.getByRole('button', { name: /^upload$/i }));

    expect(await screen.findByText(/x-amz-tagging/i)).toBeInTheDocument();
    expect(screen.getByText(/uploading to s3 failed/i)).toBeInTheDocument();
  });
});
