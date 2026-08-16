import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, TextField, Typography } from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../contexts/AuthContext';
import {
  requestPasswordReset,
  confirmPasswordReset,
  type SignInResult,
} from '../lib/cognitoClient';

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
// (§5.1) answer a new-password challenge on first login (collecting any
// pool-required attributes), and the prod pool adds TOTP setup (QR code) /
// entry; each challenge renders as its own step. A forgot-password flow
// (emailed code → new password) is reachable from the credentials form. On
// success, return to the originally requested route (or the section editor by
// default).
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
  // Self-service password recovery (§5.1): request emails a code, confirm
  // exchanges code + new password. Mutually exclusive with a login challenge.
  const [resetStep, setResetStep] = useState<'request' | 'confirm' | null>(null);
  const [resetCode, setResetCode] = useState('');
  const [notice, setNotice] = useState('');
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

  async function submitReset(action: () => Promise<void>, onDone: () => void) {
    setError('');
    setSubmitting(true);
    try {
      await action();
      onDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
    } finally {
      setSubmitting(false);
    }
  }

  function handleResetRequest(e: FormEvent) {
    e.preventDefault();
    void submitReset(
      () => requestPasswordReset(email),
      () => {
        setNotice(`Verification code sent to ${email}.`);
        setResetStep('confirm');
      },
    );
  }

  function handleResetConfirm(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    void submitReset(
      () => confirmPasswordReset(email, resetCode, newPassword),
      () => {
        setNotice('Password updated — sign in with your new password.');
        setResetStep(null);
        setResetCode('');
        setNewPassword('');
        setConfirmPassword('');
        setPassword('');
      },
    );
  }

  function startReset() {
    setError('');
    setNotice('');
    setResetStep('request');
  }

  function backToSignIn() {
    setError('');
    setNotice('');
    setResetStep(null);
    setResetCode('');
  }

  const heading =
    resetStep !== null
      ? 'Reset password'
      : challenge?.kind === 'newPasswordRequired'
        ? 'Set a new password'
        : challenge?.kind === 'totpSetupRequired'
          ? 'Set up authenticator'
          : challenge?.kind === 'totpRequired'
            ? 'Enter authenticator code'
            : 'Portfolio v6 Admin';

  const subheading =
    resetStep === 'request'
      ? "Enter your email and we'll send a verification code."
      : resetStep === 'confirm'
        ? 'Enter the code from your email and choose a new password. Minimum 12 characters with upper, lower, number, and symbol (spec §5.1).'
        : challenge?.kind === 'newPasswordRequired'
          ? 'Your temporary password must be replaced before continuing. Minimum 12 characters with upper, lower, number, and symbol (spec §5.1).'
          : challenge?.kind === 'totpSetupRequired'
            ? 'Scan the QR code with an authenticator app (Google Authenticator, 1Password, …), then enter the 6-digit code it shows.'
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
          {notice && !error && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {notice}
            </Alert>
          )}

          {challenge === null && resetStep === null && (
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
              <Button onClick={startReset} size="small" fullWidth sx={{ mt: 1 }}>
                Forgot password?
              </Button>
            </Box>
          )}

          {resetStep === 'request' && (
            <Box component="form" onSubmit={handleResetRequest} noValidate>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
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
                {submitting ? 'Sending…' : 'Send Code'}
              </Button>
              <Button onClick={backToSignIn} size="small" fullWidth sx={{ mt: 1 }}>
                Back to sign in
              </Button>
            </Box>
          )}

          {resetStep === 'confirm' && (
            <Box component="form" onSubmit={handleResetConfirm} noValidate>
              <TextField
                label="Verification code"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                autoComplete="one-time-code"
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                fullWidth
                margin="normal"
              />
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
                {submitting ? 'Resetting…' : 'Reset Password'}
              </Button>
              <Button onClick={backToSignIn} size="small" fullWidth sx={{ mt: 1 }}>
                Back to sign in
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
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                    {/* Standard otpauth:// payload — scannable by any TOTP app.
                        White quiet zone keeps it readable on the dark theme. */}
                    <Box sx={{ bgcolor: '#fff', p: 1.5, borderRadius: 1, lineHeight: 0 }}>
                      <QRCodeSVG
                        value={`otpauth://totp/${encodeURIComponent('portfolio-v6-admin')}:${encodeURIComponent(email)}?secret=${challenge.secret}&issuer=${encodeURIComponent('portfolio-v6-admin')}`}
                        size={180}
                      />
                    </Box>
                  </Box>
                  <Alert severity="info" sx={{ mb: 2, wordBreak: 'break-all' }}>
                    Can&apos;t scan? Enter this secret manually:{' '}
                    <Typography component="code" sx={{ fontFamily: 'monospace' }}>
                      {challenge.secret}
                    </Typography>
                  </Alert>
                </>
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
