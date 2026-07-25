/**
 * A single asset tile — thumbnail (or a mime-typed placeholder for non-images), the
 * mime/size metadata line, and the orphan badge with its scheduled deletion date (§6.9).
 * Reused by both the library grid and the picker so orphan/metadata rendering is identical
 * in both. Selection and delete are optional behaviours driven by the props.
 */
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import BrokenImageIcon from '@mui/icons-material/BrokenImage';
import MovieIcon from '@mui/icons-material/Movie';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import type { MediaAsset } from '../../types/media';
import {
  formatBytes,
  formatDate,
  isImage,
  isOrphaned,
  isVideo,
  mediaUrl,
  scheduledDeletionDate,
} from '../../lib/media';

interface MediaThumbnailProps {
  asset: MediaAsset;
  /** Highlight as the current selection (picker use). */
  selected?: boolean;
  /** When set, the whole tile becomes a selection button. */
  onSelect?: (asset: MediaAsset) => void;
  /** When set, a delete affordance is shown in the corner. */
  onDelete?: (asset: MediaAsset) => void;
}

function Placeholder({ asset }: { asset: MediaAsset }) {
  const Icon = isVideo(asset) ? MovieIcon : InsertDriveFileIcon;
  return (
    <Box
      sx={{
        aspectRatio: '4 / 3',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'action.hover',
        color: 'text.secondary',
      }}
    >
      <Icon fontSize="large" />
    </Box>
  );
}

function Thumb({ asset }: { asset: MediaAsset }) {
  if (!isImage(asset)) return <Placeholder asset={asset} />;
  return (
    <Box
      component="img"
      src={mediaUrl(asset)}
      alt={asset.alt ?? ''}
      loading="lazy"
      sx={{
        display: 'block',
        width: '100%',
        aspectRatio: '4 / 3',
        objectFit: 'cover',
        bgcolor: 'action.hover',
      }}
      onError={(e) => {
        // A broken CDN URL shouldn't blank the tile — swap in a placeholder glyph.
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

export default function MediaThumbnail({ asset, selected, onSelect, onDelete }: MediaThumbnailProps) {
  const orphaned = isOrphaned(asset);
  const deletionDate = scheduledDeletionDate(asset);

  const body = (
    <>
      <Box sx={{ position: 'relative' }}>
        <Thumb asset={asset} />
        {orphaned && (
          <Tooltip
            title={
              deletionDate
                ? `Orphaned — scheduled for deletion on ${formatDate(deletionDate)} (§6.9)`
                : 'Orphaned — scheduled for deletion (§6.9)'
            }
          >
            <Chip
              icon={<ReportProblemIcon />}
              label="Orphan"
              size="small"
              color="warning"
              sx={{ position: 'absolute', top: 8, left: 8 }}
            />
          </Tooltip>
        )}
        {!asset.confirmed_at && (
          <Chip
            icon={<BrokenImageIcon />}
            label="Unconfirmed"
            size="small"
            color="default"
            sx={{ position: 'absolute', top: 8, right: 8 }}
          />
        )}
      </Box>
      <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
        <Typography variant="body2" noWrap title={asset.s3_key} sx={{ fontWeight: 600 }}>
          {asset.s3_key.split('/').pop()}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          {asset.mime} · {formatBytes(asset.bytes)}
        </Typography>
        {asset.alt && (
          <Typography variant="caption" color="text.secondary" component="div" noWrap>
            Alt: {asset.alt}
          </Typography>
        )}
        {orphaned && deletionDate && (
          <Typography variant="caption" color="warning.main" component="div" data-testid="deletion-date">
            Deletes {formatDate(deletionDate)}
          </Typography>
        )}
      </CardContent>
    </>
  );

  return (
    <Card
      variant="outlined"
      data-testid="media-card"
      sx={{
        position: 'relative',
        borderColor: selected ? 'primary.main' : undefined,
        borderWidth: selected ? 2 : 1,
      }}
    >
      {onSelect ? (
        <CardActionArea onClick={() => onSelect(asset)} aria-label={`Select ${asset.s3_key.split('/').pop()}`}>
          {body}
        </CardActionArea>
      ) : (
        body
      )}
      {onDelete && (
        <Stack sx={{ position: 'absolute', bottom: 8, right: 8 }}>
          <Tooltip title="Delete asset">
            <IconButton
              size="small"
              aria-label={`Delete ${asset.s3_key.split('/').pop()}`}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(asset);
              }}
              sx={{ bgcolor: 'background.paper', boxShadow: 1, '&:hover': { bgcolor: 'background.paper' } }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      )}
    </Card>
  );
}
