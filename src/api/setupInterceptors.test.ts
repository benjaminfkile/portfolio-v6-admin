import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import apiClient from './apiClient';
import { setupInterceptors, ejectInterceptor } from './setupInterceptors';
import { getIdToken } from '../lib/cognitoClient';

vi.mock('../lib/cognitoClient');
const mockGetIdToken = vi.mocked(getIdToken);

const mock = new MockAdapter(apiClient);

let logout: ReturnType<typeof vi.fn>;
let navigate: ReturnType<typeof vi.fn>;
let interceptorId: number;

beforeEach(() => {
  logout = vi.fn();
  navigate = vi.fn();
  // Default: refresh yields no valid session.
  mockGetIdToken.mockResolvedValue(null);
  interceptorId = setupInterceptors(logout, navigate);
});

afterEach(() => {
  ejectInterceptor(interceptorId);
  mock.reset();
  vi.resetAllMocks();
});

describe('setupInterceptors 401 handling', () => {
  it('logs out and navigates to /login on 401 when the token refresh fails', async () => {
    mock.onGet('/test').reply(401);
    mockGetIdToken.mockResolvedValue(null);

    await expect(apiClient.get('/test')).rejects.toThrow();

    expect(logout).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('silently refreshes and retries exactly once on 401, then succeeds', async () => {
    mock.onGet('/test').replyOnce(401).onGet('/test').replyOnce(200, { ok: true });
    mockGetIdToken.mockResolvedValue('fresh-token');

    const response = await apiClient.get('/test');

    expect(response.status).toBe(200);
    expect(logout).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(mock.history.get).toHaveLength(2);
    // The retry carried the refreshed token.
    expect(mock.history.get[1].headers?.Authorization).toBe('Bearer fresh-token');
  });

  it('logs out when the retry also returns 401 (no infinite loop)', async () => {
    mock.onGet('/test').reply(401);
    mockGetIdToken.mockResolvedValue('fresh-token');

    await expect(apiClient.get('/test')).rejects.toThrow();

    expect(logout).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/login');
    // Original + exactly one retry.
    expect(mock.history.get).toHaveLength(2);
  });

  it('does not log out on 500 or 403', async () => {
    mock.onGet('/five').reply(500);
    mock.onGet('/three').reply(403);

    await expect(apiClient.get('/five')).rejects.toThrow();
    await expect(apiClient.get('/three')).rejects.toThrow();

    expect(logout).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('re-throws so callers can still catch the error', async () => {
    mock.onGet('/test').reply(401);

    await expect(apiClient.get('/test')).rejects.toMatchObject({
      response: { status: 401 },
    });
  });

  it('does nothing once the interceptor is ejected', async () => {
    ejectInterceptor(interceptorId);
    mock.onGet('/test').reply(401);

    await expect(apiClient.get('/test')).rejects.toThrow();

    expect(logout).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
