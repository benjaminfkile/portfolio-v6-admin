import { Box, Paper, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface PagePlaceholderProps {
  title: string;
  description: string;
  children?: ReactNode;
}

// Stub scaffold for routes built out by sibling tasks (§8.3). Themed via MUI/`sx` only.
export default function PagePlaceholder({ title, description, children }: PagePlaceholderProps) {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        {title}
      </Typography>
      <Paper variant="outlined" sx={{ p: 3, bgcolor: 'background.paper' }}>
        <Typography color="text.secondary">{description}</Typography>
        {children}
      </Paper>
    </Box>
  );
}
