/**
 * Admin analytics API (§4.8, v1.4). The public site beacons a small, privacy-respecting
 * event set to the API; the API stores it in Postgres and returns one curated aggregate
 * here. This module is read-only — there is exactly one endpoint.
 *
 * Follows the versionsApi/integrationsApi conventions: unwrap the §4.3 envelope
 * ({status,error,data}) and return just the payload. Errors surface as non-2xx and are
 * thrown by axios for the page's error/retry handling.
 */
import apiClient from './apiClient';
import type { AnalyticsRange, AnalyticsSummary, DailyPoint } from '../types/admin';

/** The §4.3 success envelope. Errors come back non-2xx and are thrown by axios. */
interface Envelope<T> {
  status: 'ok' | 'error';
  error: boolean;
  data?: T;
  errorMsg?: string;
}

function unwrap<T>(resp: { data: Envelope<T> }): T {
  return resp.data.data as T;
}

/**
 * GET /api/admin/analytics?days=7|30|90 — the aggregated first-party summary (§4.8).
 * `days` is validated server-side against the 7/30/90 allowlist (default 30).
 */
export async function getAnalytics(days: AnalyticsRange): Promise<AnalyticsSummary> {
  return unwrap<AnalyticsSummary>(
    await apiClient.get('/api/admin/analytics', { params: { days } }),
  );
}

// ---- Gap-filling (§4.8) ----------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse a `YYYY-MM-DD` day to a UTC-midnight epoch, timezone-independently. */
function parseDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Format a UTC-midnight epoch back to `YYYY-MM-DD`. */
function formatDay(epoch: number): string {
  const d = new Date(epoch);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/**
 * Fill the gaps the API leaves for zero-activity days (§4.8) so the chart gets one bar per
 * calendar day. Spans from the earliest to the latest day present in `daily` (inclusive),
 * inserting `{ pageviews: 0, visitors: 0 }` for every missing day, sorted ascending. An
 * empty input yields an empty array (the page shows its empty state instead of a chart).
 */
export function fillDailyGaps(daily: DailyPoint[]): DailyPoint[] {
  if (daily.length === 0) return [];

  const byDate = new Map(daily.map((point) => [point.date, point]));
  const epochs = daily.map((point) => parseDay(point.date));
  const start = Math.min(...epochs);
  const end = Math.max(...epochs);

  const filled: DailyPoint[] = [];
  for (let epoch = start; epoch <= end; epoch += DAY_MS) {
    const date = formatDay(epoch);
    filled.push(byDate.get(date) ?? { date, pageviews: 0, visitors: 0 });
  }
  return filled;
}
