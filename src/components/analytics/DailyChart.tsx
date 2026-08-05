/**
 * Daily traffic bar chart (§4.8) — hand-rolled SVG, no chart dependency (the admin has none
 * and gains none). One bar per calendar day: pageviews as the broad, lighter bar and
 * visitors as a narrower, darker overlay in front, so a day reads as "of these pageviews,
 * this many were distinct visitors". The y-axis auto-scales to the busiest day; date labels
 * are drawn sparsely in a mono face (first, last, and a few between).
 *
 * `data` MUST already be gap-filled (see `fillDailyGaps`) so there is a bar for every day,
 * including zero-activity ones.
 *
 * Accessibility: the SVG is decorative (`aria-hidden`) — the real content is a
 * visually-hidden one-sentence summary that a screen reader announces instead, plus a
 * visible legend so the two series are never distinguished by color alone. Themed entirely
 * from the MUI palette via `useTheme`, so it tracks light/dark automatically (§14.4).
 */
import { Box, Stack, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { visuallyHidden } from '@mui/utils';
import type { DailyPoint } from '../../types/admin';

interface DailyChartProps {
  /** Gap-filled daily points, ascending by date. */
  data: DailyPoint[];
}

// SVG user-space coordinates. The chart scales to its container width
// (`preserveAspectRatio="none"`), so these are a fixed drawing grid, not pixels.
const VIEW_W = 1000;
const PLOT_H = 180;
const LABEL_H = 26;
const VIEW_H = PLOT_H + LABEL_H;

/** `YYYY-MM-DD` → compact `M/D` for the sparse mono axis labels. */
function shortDay(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/** One human sentence describing the whole series, for the screen-reader summary. */
function summarize(data: DailyPoint[]): string {
  const totalPv = data.reduce((sum, p) => sum + p.pageviews, 0);
  const totalVisitors = data.reduce((sum, p) => sum + p.visitors, 0);
  const peak = data.reduce((best, p) => (p.pageviews > best.pageviews ? p : best), data[0]);
  return (
    `Daily traffic from ${data[0].date} to ${data[data.length - 1].date}: ` +
    `${totalPv} pageviews from ${totalVisitors} visitors across ${data.length} days. ` +
    `Busiest day ${peak.date} with ${peak.pageviews} pageviews.`
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      <Box
        aria-hidden
        sx={{ width: 12, height: 12, borderRadius: 0.5, backgroundColor: color, flexShrink: 0 }}
      />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}

export default function DailyChart({ data }: DailyChartProps) {
  const theme = useTheme();

  if (data.length === 0) return null;

  const pageviewsColor = alpha(theme.palette.primary.main, 0.32);
  const visitorsColor = theme.palette.primary.main;
  const axisColor = theme.palette.divider;

  // Auto-scale to the busiest day across either series; never divide by zero.
  const max = Math.max(1, ...data.flatMap((p) => [p.pageviews, p.visitors]));

  const slotW = VIEW_W / data.length;
  const barW = slotW * 0.72;
  const barX = (i: number) => i * slotW + (slotW - barW) / 2;
  const visitorW = barW * 0.5;

  // Aim for ~5 labels including the first and last day, evenly spaced.
  const labelStep = Math.max(1, Math.ceil((data.length - 1) / 4));
  const showLabel = (i: number) => i === 0 || i === data.length - 1 || i % labelStep === 0;

  return (
    <Box>
      <Box component="span" sx={visuallyHidden} data-testid="daily-chart-summary">
        {summarize(data)}
      </Box>

      <Box
        component="svg"
        aria-hidden
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        sx={{ display: 'block', width: '100%', height: { xs: 160, sm: 220 } }}
      >
        {/* Baseline */}
        <line x1={0} y1={PLOT_H} x2={VIEW_W} y2={PLOT_H} stroke={axisColor} strokeWidth={1} />

        {data.map((point, i) => {
          const pvH = (point.pageviews / max) * PLOT_H;
          const visH = (point.visitors / max) * PLOT_H;
          const x = barX(i);
          return (
            <g key={point.date}>
              <rect
                x={x}
                y={PLOT_H - pvH}
                width={barW}
                height={pvH}
                rx={1.5}
                fill={pageviewsColor}
              />
              <rect
                x={x + (barW - visitorW) / 2}
                y={PLOT_H - visH}
                width={visitorW}
                height={visH}
                rx={1.5}
                fill={visitorsColor}
              />
            </g>
          );
        })}

        {data.map((point, i) =>
          showLabel(i) ? (
            <text
              key={point.date}
              x={barX(i) + barW / 2}
              y={PLOT_H + LABEL_H - 8}
              textAnchor="middle"
              fontFamily="monospace"
              fontSize={13}
              fill={theme.palette.text.secondary}
            >
              {shortDay(point.date)}
            </text>
          ) : null,
        )}
      </Box>

      <Stack direction="row" spacing={2} sx={{ mt: 1, justifyContent: 'center' }}>
        <Swatch color={pageviewsColor} label="Pageviews" />
        <Swatch color={visitorsColor} label="Visitors" />
      </Stack>
    </Box>
  );
}
