/**
 * Analytics (§4.8, v1.4) — the admin-only read-out of the first-party, privacy-respecting
 * analytics: totals as stat cards, a hand-rolled daily bar chart, and top pages / referrers /
 * outbound links / event breakdown as dense tables. A 7 / 30 / 90-day range toggle refetches
 * the whole summary.
 *
 * The API omits zero-activity days from `daily`, so the chart's input is gap-filled here
 * ({@link fillDailyGaps}) to give one bar per calendar day. "Engaged" is the honest
 * humans-were-here metric — sessions with at least one non-pageview interaction — and the
 * engagement rate (engaged / visitors) is the headline health number, an em-dash when there
 * are no visitors to divide by.
 *
 * Loading spinner + error Alert with Retry follow the repo convention (VersionsPage,
 * IntegrationsPage); themed via MUI only (§14.4).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { getAnalytics, fillDailyGaps } from '../api/analyticsApi';
import { serverMessage } from '../api/serverMessage';
import type { AnalyticsRange, AnalyticsSummary } from '../types/admin';
import DailyChart from '../components/analytics/DailyChart';

const RANGES: AnalyticsRange[] = [7, 30, 90];

/** engaged / visitors as a 1dp percentage; an em-dash when there are no visitors. */
export function engagementRate(engaged: number, visitors: number): string {
  if (visitors === 0) return '—';
  return `${((engaged / visitors) * 100).toFixed(1)}%`;
}

interface StatCardProps {
  label: string;
  value: string;
  helperText?: string;
}

function StatCard({ label, value, helperText }: StatCardProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h4" component="p" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
        {value}
      </Typography>
      {helperText && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {helperText}
        </Typography>
      )}
    </Paper>
  );
}

interface CountRow {
  key: string;
  value: number;
}

interface CountTableProps {
  title: string;
  keyLabel: string;
  valueLabel: string;
  rows: CountRow[];
}

/** A dense two-column "thing → count" table with an empty fallback (§4.8 tables). */
function CountTable({ title, keyLabel, valueLabel, rows }: CountTableProps) {
  return (
    <Box>
      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-label={title}>
          <TableHead>
            <TableRow>
              <TableCell>{keyLabel}</TableCell>
              <TableCell align="right">{valueLabel}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2}>
                  <Typography variant="body2" color="text.secondary">
                    Nothing yet.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.key} hover>
                  <TableCell sx={{ wordBreak: 'break-all' }}>{row.key}</TableCell>
                  <TableCell align="right">{row.value.toLocaleString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState<AnalyticsRange>(30);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async (range: AnalyticsRange) => {
    setLoading(true);
    setLoadError('');
    try {
      setSummary(await getAnalytics(range));
    } catch (err) {
      setLoadError(serverMessage(err, 'Could not load analytics. Is the API reachable?'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [load, days]);

  const totals = summary?.totals;
  const isEmpty =
    summary != null && totals != null && totals.pageviews === 0 && totals.visitors === 0;

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1">
          Analytics
        </Typography>
        <Typography variant="body2" color="text.secondary">
          First-party, privacy-respecting traffic (§4.8). No cookies, no third-party scripts —
          visitor keys rotate daily, so nobody is tracked across days.
        </Typography>
      </Box>

      <ToggleButtonGroup
        exclusive
        size="small"
        color="primary"
        value={days}
        onChange={(_, next: AnalyticsRange | null) => {
          if (next != null) setDays(next);
        }}
        aria-label="Date range"
        sx={{ mb: 3 }}
      >
        {RANGES.map((range) => (
          <ToggleButton key={range} value={range} aria-label={`Last ${range} days`}>
            {range} days
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : loadError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void load(days)}>
              Retry
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : isEmpty ? (
        <Alert severity="info">
          No traffic recorded yet. Once the public site starts sending beacons, visits will
          show up here.
        </Alert>
      ) : summary && totals ? (
        <Stack spacing={4}>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
            }}
          >
            <StatCard label="Visitors" value={totals.visitors.toLocaleString()} />
            <StatCard label="Pageviews" value={totals.pageviews.toLocaleString()} />
            <StatCard
              label="Engaged sessions"
              value={totals.engaged.toLocaleString()}
              helperText="sessions that scrolled, clicked out, played a video, or toggled the theme — bots load pages, they don't interact."
            />
            <StatCard
              label="Engagement rate"
              value={engagementRate(totals.engaged, totals.visitors)}
            />
          </Box>

          <Box>
            <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
              Daily traffic
            </Typography>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <DailyChart data={fillDailyGaps(summary.daily)} />
            </Paper>
          </Box>

          <Box
            sx={{
              display: 'grid',
              gap: 3,
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            }}
          >
            <CountTable
              title="Top pages"
              keyLabel="Path"
              valueLabel="Views"
              rows={summary.top_pages.map((p) => ({ key: p.path, value: p.views }))}
            />
            <CountTable
              title="Top referrers"
              keyLabel="Origin"
              valueLabel="Visits"
              rows={summary.top_referrers.map((r) => ({ key: r.origin, value: r.count }))}
            />
            <CountTable
              title="Top outbound links"
              keyLabel="Link"
              valueLabel="Clicks"
              rows={summary.top_outbound.map((o) => ({ key: o.href, value: o.count }))}
            />
            <CountTable
              title="Event breakdown"
              keyLabel="Event"
              valueLabel="Count"
              rows={summary.events.map((e) => ({ key: e.event, value: e.count }))}
            />
          </Box>
        </Stack>
      ) : null}
    </Box>
  );
}
