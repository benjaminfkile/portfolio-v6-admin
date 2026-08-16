import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, TextField, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import type { SignInResult } from '../lib/cognitoClient';

interface LocationState {
  from?: { pathname: string };
}

// A challenge step mid-login; null = showing the credentials form.
type Challenge = Exclude<SignInResult, { kind: 'success' }> | null;

// Friendly labels for pool-required attributes the new-password challenge may
// ask for (§5.1); anything unmapped falls back to the raw attribute name.
const ATTRIBUTE_LABELS: Record<string, string> = {
  given_name: 'First name',
  family_name: 'Last name',
};

// MUI login page (spec §5.2). SRP sign-in via AuthContext. Admin-created users
// (§5.1) answer a new-password challenge on first login, and the prod pool adds
// TOTP setup/entry; each challenge renders as its own step. On success, return
// to the originally requested route (or the section editor by default).
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [challengeAttrs, setChallengeAttrs] = useState<Record<string, string>>({});
  const [totpCode, setTotpCode] = useState('');
  const [challenge, setChallenge] = useState<Challenge>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as LocationState | null)?.from?.pathname ?? '/sections';

  function handleResult(result: SignInResult) {
    if (result.kind === 'success') {
      navigate(from, { replace: true });
      return;
    }
    setTotpCode('');
    setChallengeAttrs({});
    setChallenge(result);
  }

  async function submitStep(action: () => Promise<SignInResult>) {
    setError('');
    setSubmitting(true);
    try {
      handleResult(await action());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCredentials(e: FormEvent) {
    e.preventDefault();
    void submitStep(() => login(email, password));
  }

  function handleNewPassword(e: FormEvent) {
    e.preventDefault();
    if (challenge?.kind !== 'newPasswordRequired') return;
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (challenge.missingAttributes.some((name) => !challengeAttrs[name]?.trim())) {
      setError('All fields are required.');
      return;
    }
    void submitStep(() => challenge.complete(newPassword, challengeAttrs));
  }

  function handleTotp(e: FormEvent) {
    e.preventDefault();
    if (challenge?.kind !== 'totpRequired' && challenge?.kind !== 'totpSetupRequired') return;
    void submitStep(() => challenge.complete(totpCode));
  }

  const heading =
    challenge?.kind === 'newPasswordRequired'
      ? 'Set a new password'
      : challenge?.kind === 'totpSetupRequired'
        ? 'Set up authenticator'
        : challenge?.kind === 'totpRequired'
          ? 'Enter authenticator code'
          : 'Portfolio v6 Admin';

  const subheading =
    challenge?.kind === 'newPasswordRequired'
      ? 'Your temporary password must be replaced before continuing. Minimum 12 characters with upper, lower, number, and symbol (spec §5.1).'
      : challenge?.kind === 'totpSetupRequired'
        ? 'Add the secret below to an authenticator app (Google Authenticator, 1Password, …), then enter the 6-digit code it shows.'
        : challenge?.kind === 'totpRequired'
          ? 'Enter the current 6-digit code from your authenticator app.'
          : 'Sign in to manage site content.';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" component="h1" align="center" gutterBottom>
            {heading}
          </Typography>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
            {subheading}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {challenge === null && (
            <Box component="form" onSubmit={handleCredentials} noValidate>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                fullWidth
                margin="normal"
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                fullWidth
                margin="normal"
              />
              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={submitting}
                sx={{ mt: 3 }}
              >
                {submitting ? 'Signing in…' : 'Sign In'}
              </Button>
            </Box>
          )}

          {challenge?.kind === 'newPasswordRequired' && (
            <Box component="form" onSubmit={handleNewPassword} noValidate>
              {challenge.missingAttributes.map((name) => (
                <TextField
                  key={name}
                  label={ATTRIBUTE_LABELS[name] ?? name}
                  value={challengeAttrs[name] ?? ''}
                  onChange={(e) =>
                    setChallengeAttrs((attrs) => ({ ...attrs, [name]: e.target.value }))
                  }
                  fullWidth
                  margin="normal"
                />
              ))}
              <TextField
                label="New password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                fullWidth
                margin="normal"
              />
              <TextField
                label="Confirm new password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                fullWidth
                margin="normal"
              />
              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={submitting}
                sx={{ mt: 3 }}
              >
                {submitting ? 'Saving…' : 'Set Password & Sign In'}
              </Button>
            </Box>
          )}

          {(challenge?.kind === 'totpSetupRequired' || challenge?.kind === 'totpRequired') && (
            <Box component="form" onSubmit={handleTotp} noValidate>
              {challenge.kind === 'totpSetupRequired' && (
                <Alert severity="info" sx={{ mb: 2, wordBreak: 'break-all' }}>
                  <Typography component="code" sx={{ fontFamily: 'monospace' }}>
                    {challenge.secret}
                  </Typography>
                </Alert>
              )}
              <TextField
                label="6-digit code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                autoComplete="one-time-code"
                slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6 } }}
                fullWidth
                margin="normal"
              />
              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={submitting}
                sx={{ mt: 3 }}
              >
                {submitting ? 'Verifying…' : 'Verify'}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
