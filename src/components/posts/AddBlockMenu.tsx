/**
 * Add-block menu (§3.7, §8.3). One button opening a menu that covers all 8 block types;
 * choosing one appends a fresh block of that type to the editor's array. Each entry shows
 * the type label and a one-line description from the block registry.
 */
import { useState } from 'react';
import {
  Button,
  ListItemText,
  Menu,
  MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { BlockType } from '../../types/content';
import { BLOCK_TYPE_LIST } from '../../lib/blockRegistry';

interface AddBlockMenuProps {
  onAdd: (type: BlockType) => void;
}

export default function AddBlockMenu({ onAdd }: AddBlockMenuProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const choose = (type: BlockType) => {
    setAnchorEl(null);
    onAdd(type);
  };

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        Add block
      </Button>
      <Menu anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)}>
        {BLOCK_TYPE_LIST.map((def) => (
          <MenuItem key={def.type} onClick={() => choose(def.type)} sx={{ maxWidth: 320 }}>
            <ListItemText
              primary={def.label}
              secondary={def.description}
              slotProps={{ secondary: { sx: { whiteSpace: 'normal' } } }}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
