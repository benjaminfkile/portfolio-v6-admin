/**
 * Agents page — a top-level admin page for running AI-agent editing sessions against the API.
 *
 * Workflow, spelled out in the intro: mint a machine key (the secret is shown once), paste it
 * into the agent's environment/prompt, let the agent work, then REVOKE the key the moment the
 * session ends. Revocation is immediate and keys are stored hashed — an unrevoked leaked key
 * is the only risk. Keys cannot manage other keys or read integration credentials.
 *
 * The page embeds {@link ApiKeysSection} so grant / revoke happens in place (also mounted on
 * the Integrations page — same component, two mounts), and renders {@link agentPrompt} in a
 * monospace, scrollable, read-only block with a clipboard button (same green-check flip and
 * clipboard-failure tolerance as {@link MintKeyDialog}). Themed via MUI only (§14.4).
 */
import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import ApiKeysSection from '../components/apiKeys/ApiKeysSection';
import { agentPrompt } from '../content/agentPrompt';

export default function AgentsPage() {
  const prompt = useMemo(() => agentPrompt(), []);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      // Clipboard blocked (permissions / insecure context): leave the prompt visible to copy by hand.
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1">
          Agents
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 720 }}>
          Run an AI agent against the API for a single session: mint a key, give it to the
          agent, let it work, then revoke the key the moment the session ends.
        </Typography>
      </Box>

      <Alert severity="info" sx={{ mb: 3, maxWidth: 720 }}>
        <Typography variant="subtitle2" gutterBottom>
          How the session works
        </Typography>
        <Typography variant="body2" component="div">
          <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
            <li>
              Mint a key below. The full secret is shown <strong>exactly once</strong> —
              copy it now.
            </li>
            <li>
              Paste it into the agent&apos;s environment or prompt as <code>API_KEY</code>,
              alongside the agent prompt further down this page.
            </li>
            <li>Let the agent work against the API.</li>
            <li>
              <strong>Revoke the key the moment the session ends.</strong> Revocation is
              immediate; keys are stored hashed, so an unrevoked leaked key is the only real
              risk. Keys cannot manage other keys or read integration credentials.
            </li>
          </ol>
        </Typography>
      </Alert>

      <ApiKeysSection />

      <Box component="section" sx={{ mt: 6 }}>
        <Stack
          direction="row"
          sx={{ mb: 2, alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Box>
            <Typography variant="h5" component="h2">
              Agent prompt
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 720 }}>
              Copy this into the agent&apos;s system prompt. It teaches the agent how to drive
              the API — endpoints, conventions, workflows, and rules. The API base URL is
              already interpolated for this environment.
            </Typography>
          </Box>
          <Tooltip title={copied ? 'Copied' : 'Copy prompt'}>
            <Button
              variant="outlined"
              onClick={() => void handleCopy()}
              startIcon={copied ? <CheckIcon color="success" /> : <ContentCopyIcon />}
              data-testid="copy-prompt-button"
            >
              {copied ? 'Copied' : 'Copy prompt'}
            </Button>
          </Tooltip>
        </Stack>

        <Paper
          variant="outlined"
          sx={{
            p: 2,
            maxHeight: 480,
            overflow: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.8125rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            bgcolor: (theme) =>
              theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
          }}
          data-testid="agent-prompt-block"
          aria-readonly="true"
          role="region"
          aria-label="Agent prompt"
          tabIndex={0}
        >
          {prompt}
        </Paper>
      </Box>
    </Box>
  );
}
