import apiClient from './apiClient';
import { getIdToken } from '../lib/cognitoClient';

// Ported from FileManager's src/api/setupInterceptors.ts (spec §5.2). Response
// interceptor: on 401, attempt exactly one silent refresh-and-retry, then force logout.
// This is what prevents a transient token-refresh failure from dropping the admin
// mid-edit (§5.2).
export function setupInterceptors(
  logout: () => void,
  navigate: (path: string) => void,
): number {
  const id = apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 401) {
        const originalRequest = error.config;
        if (!originalRequest._retry) {
          originalRequest._retry = true;
          const token = await getIdToken();
          if (token) {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
            return apiClient(originalRequest);
          }
        }
        // Refresh failed or the retry also got 401 — the session is truly gone.
        logout();
        navigate('/login');
      }
      return Promise.reject(error);
    },
  );
  return id;
}

export function ejectInterceptor(id: number): void {
  apiClient.interceptors.response.eject(id);
}
