import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ArticleIcon from '@mui/icons-material/Article';
import PermMediaIcon from '@mui/icons-material/PermMedia';
import HistoryIcon from '@mui/icons-material/History';
import VisibilityIcon from '@mui/icons-material/Visibility';
import HubIcon from '@mui/icons-material/Hub';
import InsightsIcon from '@mui/icons-material/Insights';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from './ThemeToggle';
import PublishSiteButton from './PublishSiteButton';

const DRAWER_WIDTH = 240;

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

// App shell navigation (spec §8.3).
const NAV_ITEMS: NavItem[] = [
  { label: 'Pages', path: '/pages', icon: <AutoStoriesIcon /> },
  { label: 'Sections', path: '/sections', icon: <ViewQuiltIcon /> },
  { label: 'Blogs', path: '/blogs', icon: <MenuBookIcon /> },
  { label: 'Posts', path: '/posts', icon: <ArticleIcon /> },
  { label: 'Media', path: '/media', icon: <PermMediaIcon /> },
  { label: 'Versions', path: '/versions', icon: <HistoryIcon /> },
  { label: 'Preview', path: '/preview', icon: <VisibilityIcon /> },
  { label: 'Integrations', path: '/integrations', icon: <HubIcon /> },
  { label: 'Analytics', path: '/analytics', icon: <InsightsIcon /> },
];

export default function AppShell() {
  const { currentUser, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const drawerContent = (
    <Box sx={{ overflow: 'auto' }}>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          Portfolio v6
        </Typography>
      </Toolbar>
      <List>
        {NAV_ITEMS.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              component={RouterLink}
              to={item.path}
              selected={isActive(item.path)}
              onClick={() => setMobileOpen(false)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <CssBaseline />
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="Open navigation"
            edge="start"
            onClick={() => setMobileOpen((prev) => !prev)}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            Admin
          </Typography>
          {/* Publish is site-level — it snapshots every page (§3.10), so it lives in
              the global chrome, not on any one editing screen. */}
          <PublishSiteButton />
          <ThemeToggle />
          {currentUser?.email && (
            <Typography variant="body2" sx={{ mx: 2, display: { xs: 'none', sm: 'block' } }}>
              {currentUser.email}
            </Typography>
          )}
          <Tooltip title="Sign out">
            <IconButton color="inherit" aria-label="Sign out" onClick={logout}>
              <LogoutIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { sm: DRAWER_WIDTH }, flexShrink: { sm: 0 } }}
        aria-label="Main navigation"
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
          }}
        >
          {drawerContent}
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
          }}
        >
          {drawerContent}
        </Drawer>
      </Box>

      <Box component="main" sx={{ flexGrow: 1, p: 3, width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` } }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
