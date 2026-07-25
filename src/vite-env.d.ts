/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin. Empty locally (same-origin, proxied — §10). */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_COGNITO_USER_POOL_ID?: string;
  readonly VITE_COGNITO_CLIENT_ID?: string;
  readonly VITE_COGNITO_REGION?: string;
  /** Public-site hostname used as the preview iframe target (§7). */
  readonly VITE_PUBLIC_SITE_URL?: string;
  /**
   * CDN base for resolving `media_assets.s3_key` to a thumbnail URL (§6.8) when the admin
   * media list does not already carry a resolved `url`. Optional — falls back to the key.
   */
  readonly VITE_CDN_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
