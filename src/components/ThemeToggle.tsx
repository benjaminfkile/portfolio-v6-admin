import { useState, type MouseEvent, type ReactNode } from 'react';
import { IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Tooltip } from '@mui/material';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';
import CheckIcon from '@mui/icons-material/Check';
import { useThemeMode, type ThemeModePreference } from '../theme/ThemeModeProvider';

const OPTIONS: { value: ThemeModePreference; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <LightModeIcon fontSize="small" /> },
  { value: 'dark', label: 'Dark', icon: <DarkModeIcon fontSize="small" /> },
  { value: 'system', label: 'System', icon: <SettingsBrightnessIcon fontSize="small" /> },
];

// Manual light / dark / system override (§14.4). The active palette is `resolvedMode`;
// the icon reflects it so the button reads correctly under a `system` preference.
export default function ThemeToggle() {
  const { preference, resolvedMode, setPreference } = useThemeMode();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleOpen = (event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);
  const handleSelect = (value: ThemeModePreference) => {
    setPreference(value);
    handleClose();
  };

  return (
    <>
      <Tooltip title="Theme">
        <IconButton
          onClick={handleOpen}
          color="inherit"
          aria-label="Change theme"
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
        >
          {resolvedMode === 'dark' ? <DarkModeIcon /> : <LightModeIcon />}
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
        {OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            selected={preference === option.value}
            onClick={() => handleSelect(option.value)}
          >
            <ListItemIcon>{option.icon}</ListItemIcon>
            <ListItemText>{option.label}</ListItemText>
            {preference === option.value && (
              <CheckIcon fontSize="small" sx={{ ml: 2, opacity: 0.7 }} />
            )}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
