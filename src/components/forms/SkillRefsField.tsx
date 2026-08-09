/**
 * Skill-references field (Skill Refs v1.8) — the composite control for a portfolio item's
 * `skill_refs`. Instead of pasting bare icon URLs (the old `tech_icons` stringList), a
 * portfolio item REFERENCES skills items by id, so its tech marks always render the exact
 * same icon + name as the skills sphere — mismatched icons are impossible by construction.
 *
 * On open it loads the skills catalog ONCE: `getPages()` → `getSections(page.id)` for each
 * page → every item of every `skills`-type section, across ALL pages (a ref may point at a
 * skill on a different page). Each catalog entry keeps its own `is_hidden` and its section's
 * hidden flag, because publish gates on a ref resolving to a NON-hidden item of a NON-hidden
 * skills section.
 *
 * The value is shown as an ORDERED list of chips (selection order = render order): a 20px
 * icon thumbnail, the skill title, up/down reorder controls, and a remove button. "Add
 * skill…" opens a searchable menu of not-yet-referenced skills. A ref whose id is not in the
 * catalog renders an error chip ("Unknown skill — will block publish"); a ref to a hidden
 * skill/section renders a warning chip ("Hidden — will block publish"). Both stay removable
 * and saveable — drafts are lenient, publish is the gate. Emits `string[]` via `onChange`.
 *
 * Styling is MUI theme + `sx` (§14.4).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Popover,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import CloseIcon from '@mui/icons-material/Close';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { getPages } from '../../api/pagesApi';
import { getSections } from '../../api/sectionsApi';
import { serverMessage } from '../../api/serverMessage';

interface SkillRefsFieldProps {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  helperText?: string;
}

/** One skills item as it sits in the catalog, with the hidden flags publish gates on. */
export interface SkillCatalogEntry {
  id: string;
  title: string;
  icon_source?: string;
  /** The item's own `is_hidden`. */
  itemHidden: boolean;
  /** The owning skills section's `is_hidden`. */
  sectionHidden: boolean;
}

/**
 * Collect every `skills`-item across all pages into a flat catalog (Skill Refs v1.8). A ref
 * may point at a skill on any page, so the whole site is scanned, not one page.
 */
export async function loadSkillsCatalog(): Promise<SkillCatalogEntry[]> {
  const pages = await getPages();
  const perPage = await Promise.all(pages.map((page) => getSections(page.id)));
  const catalog: SkillCatalogEntry[] = [];
  for (const sections of perPage) {
    for (const section of sections) {
      if (section.type !== 'skills') continue;
      for (const item of section.items) {
        const data = item.data as { title?: string; icon_source?: string };
        catalog.push({
          id: item.id,
          title: data.title ?? '(untitled skill)',
          icon_source: data.icon_source,
          itemHidden: item.is_hidden,
          sectionHidden: section.is_hidden,
        });
      }
    }
  }
  return catalog;
}

export default function SkillRefsField({ label, value, onChange, helperText }: SkillRefsFieldProps) {
  const refs = Array.isArray(value) ? value : [];

  const [catalog, setCatalog] = useState<SkillCatalogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError('');
    loadSkillsCatalog()
      .then((entries) => {
        if (alive) setCatalog(entries);
      })
      .catch((err) => {
        if (alive) setLoadError(serverMessage(err, 'Could not load the skills catalog.'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // Load once when the field opens; the catalog is stable for the edit session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = useMemo(() => {
    const map = new Map<string, SkillCatalogEntry>();
    for (const entry of catalog ?? []) map.set(entry.id, entry);
    return map;
  }, [catalog]);

  // Skills not already referenced, filtered by the search box (over title).
  const addable = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (catalog ?? [])
      .filter((entry) => !refs.includes(entry.id))
      .filter((entry) => (q ? entry.title.toLowerCase().includes(q) : true));
  }, [catalog, refs, search]);

  const removeAt = (index: number) => {
    onChange(refs.filter((_, i) => i !== index));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= refs.length) return;
    const next = [...refs];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const addSkill = (id: string) => {
    onChange([...refs, id]);
    setSearch('');
    setAnchorEl(null);
  };

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        {label}
      </Typography>

      {loading && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', py: 1 }}>
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">
            Loading skills…
          </Typography>
        </Stack>
      )}

      {!loading && loadError && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {loadError}
        </Alert>
      )}

      {!loading && refs.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          No skills referenced yet.
        </Typography>
      )}

      <Stack spacing={1}>
        {refs.map((id, index) => {
          const entry = byId.get(id);
          const unknown = !loading && !loadError && catalog !== null && !entry;
          const hidden = Boolean(entry && (entry.itemHidden || entry.sectionHidden));

          // Border/tone signals the chip's state; the reorder + remove controls are the same
          // on every variant so a broken ref is still fixable.
          const borderColor = unknown ? 'error.main' : hidden ? 'warning.main' : 'divider';
          const name = entry?.title ?? id;

          return (
            <Stack
              key={`${id}-${index}`}
              direction="row"
              spacing={1}
              data-testid="skill-ref-chip"
              sx={{
                alignItems: 'center',
                border: 1,
                borderColor,
                borderRadius: 1,
                px: 1,
                py: 0.5,
              }}
            >
              {unknown ? (
                <ErrorOutlineIcon fontSize="small" color="error" />
              ) : hidden ? (
                <VisibilityOffIcon fontSize="small" color="warning" />
              ) : entry?.icon_source ? (
                <Box
                  component="img"
                  crossOrigin="anonymous"
                  src={entry.icon_source}
                  alt={entry.title}
                  sx={{ width: 20, height: 20, objectFit: 'contain' }}
                />
              ) : (
                <Box sx={{ width: 20, height: 20 }} />
              )}

              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap>
                  {name}
                </Typography>
                {unknown && (
                  <Typography variant="caption" color="error">
                    Unknown skill — will block publish
                  </Typography>
                )}
                {hidden && (
                  <Typography variant="caption" color="warning.main">
                    Hidden — will block publish
                  </Typography>
                )}
              </Box>

              <IconButton
                size="small"
                aria-label={`Move ${name} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUpwardIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                aria-label={`Move ${name} down`}
                disabled={index === refs.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDownwardIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                aria-label={`Remove ${name}`}
                onClick={() => removeAt(index)}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          );
        })}
      </Stack>

      <Button
        startIcon={<AddIcon />}
        size="small"
        sx={{ mt: 1 }}
        disabled={loading || Boolean(loadError)}
        onClick={(e) => {
          setSearch('');
          setAnchorEl(e.currentTarget);
        }}
      >
        Add skill…
      </Button>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 300 } } }}
      >
        <Box sx={{ p: 1 }}>
          <TextField
            label="Search skills"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            size="small"
            autoFocus
          />
        </Box>
        <List dense sx={{ maxHeight: 320, overflowY: 'auto', pt: 0 }}>
          {addable.length === 0 ? (
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {(catalog ?? []).length === 0
                  ? 'No skills exist yet — add some to a Skills section first.'
                  : 'No matching skills.'}
              </Typography>
            </Box>
          ) : (
            addable.map((entry) => (
              <ListItemButton
                key={entry.id}
                aria-label={`Add ${entry.title}`}
                onClick={() => addSkill(entry.id)}
              >
                {entry.icon_source ? (
                  <Box
                    component="img"
                    crossOrigin="anonymous"
                    src={entry.icon_source}
                    alt=""
                    sx={{ width: 20, height: 20, objectFit: 'contain', mr: 1.5, flexShrink: 0 }}
                  />
                ) : (
                  <Box sx={{ width: 20, height: 20, mr: 1.5, flexShrink: 0 }} />
                )}
                <ListItemText
                  primary={entry.title}
                  secondary={
                    entry.itemHidden || entry.sectionHidden ? 'Hidden — will block publish' : undefined
                  }
                />
              </ListItemButton>
            ))
          )}
        </List>
      </Popover>

      {helperText && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {helperText}
        </Typography>
      )}
    </Box>
  );
}
