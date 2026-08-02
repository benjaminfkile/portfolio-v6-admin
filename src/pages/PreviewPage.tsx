/**
 * Page preview (§7). Mints a preview token and embeds the real public site's draft page in an
 * iframe. In v1.1 preview is page-scoped (§3.10): a selector chooses which page to preview and
 * the iframe targets that page's public path — `/` for the `home` slug, `/<slug>` otherwise —
 * with the `?preview=<token>` wiring unchanged. The public site, seeing `?preview=`, serializes
 * the *draft* working set for that page and renders it through its normal component tree — so
 * preview is the production renderer by construction, with no second copy to drift.
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, Stack, Tab, Tabs, Typography } from '@mui/material';
import PreviewFrame from '../components/preview/PreviewFrame';
import { pagePreviewUrl } from '../lib/previewUrl';
import { getPages } from '../api/pagesApi';
import type { Page } from '../types/admin';

/** The slug previewed until the page list loads / when it can't be loaded (renders at `/`). */
const DEFAULT_SLUG = 'home';

export default function PreviewPage() {
  const [pages, setPages] = useState<Page[]>([]);
  const [slug, setSlug] = useState(DEFAULT_SLUG);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loaded = [...(await getPages())].sort((a, b) => a.nav_position - b.nav_position);
        if (active) setPages(loaded);
      } catch {
        // Preview still works for home; the selector just won't render.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Same token, different target page — build the §7 URL for the selected slug.
  const buildUrl = useCallback((token: string) => pagePreviewUrl(slug, token), [slug]);

  return (
    <Stack sx={{ minHeight: 'calc(100vh - 128px)' }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4" component="h1">
          Preview
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The draft page rendered by the public site itself, inside an iframe (§7). Pick a page to
          preview; changes you save become visible here without publishing.
        </Typography>
      </Box>

      {pages.length > 0 && (
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs
            value={pages.some((p) => p.slug === slug) ? slug : false}
            onChange={(_e, value: string) => setSlug(value)}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="Select a page to preview"
          >
            {pages.map((page) => (
              <Tab key={page.id} value={page.slug} label={page.title} />
            ))}
          </Tabs>
        </Box>
      )}

      <PreviewFrame title="Draft page preview" buildUrl={buildUrl} />
    </Stack>
  );
}
