/**
 * Responsive asset grid (§14.4) — a CSS-grid `Box` (not MUI `Grid`, to stay version-proof)
 * that lays {@link MediaThumbnail} tiles out one/two/three/four across as the viewport
 * grows. Selection and delete behaviours pass straight through to each tile.
 */
import { Box } from '@mui/material';
import type { MediaAsset } from '../../types/media';
import MediaThumbnail from './MediaThumbnail';

interface MediaGridProps {
  assets: MediaAsset[];
  selectedId?: string;
  onSelect?: (asset: MediaAsset) => void;
  onDelete?: (asset: MediaAsset) => void;
}

export default function MediaGrid({ assets, selectedId, onSelect, onDelete }: MediaGridProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: {
          xs: '1fr',
          sm: 'repeat(2, 1fr)',
          md: 'repeat(3, 1fr)',
          lg: 'repeat(4, 1fr)',
        },
      }}
    >
      {assets.map((asset) => (
        <MediaThumbnail
          key={asset.id}
          asset={asset}
          selected={selectedId === asset.id}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </Box>
  );
}
