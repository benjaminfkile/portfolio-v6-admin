/**
 * Page preview (§7). Mints a preview token and embeds the real public site's draft page in
 * an iframe at `VITE_PUBLIC_SITE_URL + "/?preview=<token>"`. The public site, seeing
 * `?preview=`, serializes the *draft* working set and renders it through its normal
 * component tree — so preview is the production renderer by construction, with no second
 * copy to drift.
 */
import { Box, Stack, Typography } from '@mui/material';
import PreviewFrame from '../components/preview/PreviewFrame';
import { pagePreviewUrl } from '../lib/previewUrl';

export default function PreviewPage() {
  return (
    <Stack sx={{ minHeight: 'calc(100vh - 128px)' }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4" component="h1">
          Preview
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The draft page rendered by the public site itself, inside an iframe (§7). Changes you
          save become visible here without publishing.
        </Typography>
      </Box>
      <PreviewFrame title="Draft page preview" buildUrl={pagePreviewUrl} />
    </Stack>
  );
}
