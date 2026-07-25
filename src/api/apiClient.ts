import axios from 'axios';
import { getIdToken } from '../lib/cognitoClient';

// Ported from FileManager's src/api/apiClient.ts (spec §5.2), adapted to Vite env vars.
// `VITE_API_BASE_URL` is empty locally so requests are same-origin and the dev proxy
// (§10) forwards `/api` to the API container; in production it is the gateway origin.
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
});

// Request interceptor: attach `Authorization: Bearer <idToken>` when a session exists.
apiClient.interceptors.request.use(async (config) => {
  const token = await getIdToken();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

export default apiClient;
