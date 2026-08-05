import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AnalyticsPage from './AnalyticsPage';
import * as api from '../api/analyticsApi';
import type { AnalyticsSummary } from '../types/admin';

vi.mock('../api/analyticsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/analyticsApi')>();
  return {
    ...actual, // keep the real fillDailyGaps — only the network call is mocked
    getAnalytics: vi.fn(),
  };
});

/**
 * A fixture with a deliberate gap: the API omits zero-activity days (§4.8). Here Aug 2 and
 * Aug 3 are missing between Aug 1 and Aug 4, so the page must fill them to get one bar per day.
 */
const summary: AnalyticsSummary = {
  days: 30,
  totals: { pageviews: 1200, visitors: 800, engaged: 200 },
  daily: [
    { date: '2026-08-01', pageviews: 100, visitors: 60 },
    // 2026-08-02 and 2026-08-03 omitted — zero activity
    { date: '2026-08-04', pageviews: 140, visitors: 90 },
  ],
  top_pages: [
    { path: '/', views: 500 },
    { path: '/about', views: 120 },
  ],
  top_referrers: [{ origin: 'https://news.ycombinator.com', count: 40 }],
  events: [
    { event: 'pageview', count: 1200 },
    { event: 'link_out', count: 75 },
  ],
  top_outbound: [{ href: 'github.com/benkile', count: 30 }],
};

const emptySummary: AnalyticsSummary = {
  days: 30,
  totals: { pageviews: 0, visitors: 0, engaged: 0 },
  daily: [],
  top_pages: [],
  top_referrers: [],
  events: [],
  top_outbound: [],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/analytics']}>
      <AnalyticsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAnalytics).mockResolvedValue(summary);
});

describe('AnalyticsPage — totals & engagement (§4.8)', () => {
  it('renders the stat cards, including the engagement-rate math (200/800 = 25.0%)', async () => {
    renderPage();

    // Cards are label/value pairs — assert each value sits under its label. Scope to the
    // card's overline label so the chart legend's "Visitors"/"Pageviews" don't collide.
    const cardLabel = { selector: '.MuiTypography-overline' } as const;
    const visitors = (await screen.findByText('Visitors', cardLabel)).closest(
      '.MuiPaper-root',
    ) as HTMLElement;
    expect(within(visitors).getByText('800')).toBeInTheDocument();

    const pageviews = screen
      .getByText('Pageviews', cardLabel)
      .closest('.MuiPaper-root') as HTMLElement;
    expect(within(pageviews).getByText('1,200')).toBeInTheDocument();

    const engaged = screen.getByText('Engaged sessions').closest('.MuiPaper-root') as HTMLElement;
    expect(within(engaged).getByText('200')).toBeInTheDocument();
    // The engaged helperText spells out what "engaged" means.
    expect(within(engaged).getByText(/bots load pages, they don't interact/i)).toBeInTheDocument();

    const rate = screen.getByText('Engagement rate').closest('.MuiPaper-root') as HTMLElement;
    expect(within(rate).getByText('25.0%')).toBeInTheDocument();
  });

  it('shows an em-dash engagement rate when there are no visitors to divide by', async () => {
    vi.mocked(api.getAnalytics).mockResolvedValue({
      ...summary,
      totals: { pageviews: 5, visitors: 0, engaged: 0 },
    });
    renderPage();

    const rate = (await screen.findByText('Engagement rate')).closest(
      '.MuiPaper-root',
    ) as HTMLElement;
    expect(within(rate).getByText('—')).toBeInTheDocument();
  });
});

describe('AnalyticsPage — range toggle (§4.8)', () => {
  it('loads 30 days by default and refetches with 7 / 30 / 90 as the range changes', async () => {
    const user = userEvent.setup();
    renderPage();

    // Initial load is the 30-day default.
    await waitFor(() => expect(api.getAnalytics).toHaveBeenCalledWith(30));

    await user.click(screen.getByRole('button', { name: /last 7 days/i }));
    await waitFor(() => expect(api.getAnalytics).toHaveBeenCalledWith(7));

    await user.click(screen.getByRole('button', { name: /last 90 days/i }));
    await waitFor(() => expect(api.getAnalytics).toHaveBeenCalledWith(90));
  });
});

describe('AnalyticsPage — daily chart gap-filling (§4.8)', () => {
  it("summarizes the whole span, filling the fixture's missing days to one bar per day", async () => {
    renderPage();

    // The visually-hidden summary spans the full 4-day range (Aug 1–Aug 4), which is only
    // possible if the two omitted zero-activity days were filled in.
    const chartSummary = await screen.findByTestId('daily-chart-summary');
    expect(chartSummary).toHaveTextContent('from 2026-08-01 to 2026-08-04');
    expect(chartSummary).toHaveTextContent('across 4 days');
  });

  it('fillDailyGaps inserts zero days across a gap and sorts ascending', () => {
    const filled = api.fillDailyGaps([
      { date: '2026-08-04', pageviews: 140, visitors: 90 },
      { date: '2026-08-01', pageviews: 100, visitors: 60 },
    ]);
    expect(filled.map((d) => d.date)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
    ]);
    // The interpolated days carry zeros.
    expect(filled[1]).toEqual({ date: '2026-08-02', pageviews: 0, visitors: 0 });
    expect(filled[2]).toEqual({ date: '2026-08-03', pageviews: 0, visitors: 0 });
  });
});

describe('AnalyticsPage — tables (§4.8)', () => {
  it('renders rows for top pages, referrers, outbound links and event breakdown', async () => {
    renderPage();

    const topPages = (await screen.findByRole('table', { name: 'Top pages' })) as HTMLElement;
    expect(within(topPages).getByText('/about')).toBeInTheDocument();
    expect(within(topPages).getByText('120')).toBeInTheDocument();

    const referrers = screen.getByRole('table', { name: 'Top referrers' });
    expect(within(referrers).getByText('https://news.ycombinator.com')).toBeInTheDocument();

    const outbound = screen.getByRole('table', { name: 'Top outbound links' });
    expect(within(outbound).getByText('github.com/benkile')).toBeInTheDocument();

    const events = screen.getByRole('table', { name: 'Event breakdown' });
    expect(within(events).getByText('link_out')).toBeInTheDocument();
  });
});

describe('AnalyticsPage — states', () => {
  it('shows the friendly empty state when no traffic has been recorded', async () => {
    vi.mocked(api.getAnalytics).mockResolvedValue(emptySummary);
    renderPage();

    expect(await screen.findByText(/no traffic recorded yet/i)).toBeInTheDocument();
    // No chart is drawn in the empty state.
    expect(screen.queryByTestId('daily-chart-summary')).not.toBeInTheDocument();
  });

  it('shows an error alert with Retry that refetches', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getAnalytics).mockRejectedValueOnce(new Error('network'));
    renderPage();

    expect(await screen.findByText(/could not load analytics/i)).toBeInTheDocument();

    vi.mocked(api.getAnalytics).mockResolvedValue(summary);
    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(await screen.findByText('Engagement rate')).toBeInTheDocument();
  });
});
