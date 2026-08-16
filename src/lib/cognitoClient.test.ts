import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as cognitoSdk from 'amazon-cognito-identity-js';

// Drive the real cognitoClient wrapper through the manual SDK mock (login flow, §5.2).
vi.mock('amazon-cognito-identity-js');

import {
  signIn,
  getIdToken,
  signOut,
  requestPasswordReset,
  confirmPasswordReset,
} from './cognitoClient';

// Mock-only helpers — see __mocks__/amazon-cognito-identity-js.ts.
const sdk = cognitoSdk as unknown as {
  __reset: () => void;
  __setSession: (idToken: string, valid?: boolean) => void;
  __setAuthError: (error: Error | null) => void;
  __setSignedIn: (idToken?: string, valid?: boolean) => void;
  __setSessionError: (error: Error) => void;
  __setChallenge: (c: 'newPasswordRequired' | 'totpRequired' | 'mfaSetup') => void;
  __setNewPasswordChallengeAttributes: (
    userAttributes: Record<string, string>,
    requiredAttributes: string[],
  ) => void;
  __getLastNewPasswordAttrs: () => Record<string, string> | null;
};

beforeEach(() => {
  sdk.__reset();
});

describe('cognitoClient', () => {
  it('signIn resolves the id token JWT on successful SRP auth', async () => {
    sdk.__setSession('id-token-123');
    await expect(signIn('admin@benkile.com', 'correct-horse')).resolves.toEqual({
      kind: 'success',
      idToken: 'id-token-123',
    });
  });

  it('signIn surfaces NEW_PASSWORD_REQUIRED and completes to success (§5.1 admin-created users)', async () => {
    sdk.__setChallenge('newPasswordRequired');
    sdk.__setSession('post-challenge-token');

    const first = await signIn('admin@benkile.com', 'temp-password');
    expect(first.kind).toBe('newPasswordRequired');
    if (first.kind !== 'newPasswordRequired') throw new Error('unreachable');

    await expect(first.complete('New-Password-123!')).resolves.toEqual({
      kind: 'success',
      idToken: 'post-challenge-token',
    });
  });

  it('surfaces pool-required attributes the invite left unset and sends the collected values', async () => {
    // An invited user with no given_name/family_name: Cognito lists both as
    // required, and completing without them fails with "Invalid attributes
    // given, given_name is missing".
    sdk.__setChallenge('newPasswordRequired');
    sdk.__setNewPasswordChallengeAttributes({ email: 'x@y.z', email_verified: 'true' }, [
      'given_name',
      'family_name',
    ]);
    sdk.__setSession('post-challenge-token');

    const first = await signIn('admin@benkile.com', 'temp-password');
    if (first.kind !== 'newPasswordRequired') throw new Error('unreachable');
    expect(first.missingAttributes).toEqual(['given_name', 'family_name']);

    await expect(
      first.complete('New-Password-123!', { given_name: 'Ben', family_name: 'Kile' }),
    ).resolves.toEqual({ kind: 'success', idToken: 'post-challenge-token' });
    // Exactly the required set — never email_verified, which Cognito rejects.
    expect(sdk.__getLastNewPasswordAttrs()).toEqual({ given_name: 'Ben', family_name: 'Kile' });
  });

  it('echoes required attributes already on the profile without needing form input', async () => {
    sdk.__setChallenge('newPasswordRequired');
    sdk.__setNewPasswordChallengeAttributes(
      { email: 'x@y.z', email_verified: 'true', given_name: 'Ben', family_name: 'Kile' },
      ['given_name', 'family_name'],
    );
    sdk.__setSession('post-challenge-token');

    const first = await signIn('admin@benkile.com', 'temp-password');
    if (first.kind !== 'newPasswordRequired') throw new Error('unreachable');
    expect(first.missingAttributes).toEqual([]);

    await expect(first.complete('New-Password-123!')).resolves.toEqual({
      kind: 'success',
      idToken: 'post-challenge-token',
    });
    expect(sdk.__getLastNewPasswordAttrs()).toEqual({ given_name: 'Ben', family_name: 'Kile' });
  });

  it('rejects a weak new password with the Cognito error, not a crash', async () => {
    sdk.__setChallenge('newPasswordRequired');
    const first = await signIn('admin@benkile.com', 'temp-password');
    if (first.kind !== 'newPasswordRequired') throw new Error('unreachable');

    sdk.__setAuthError(new Error('Password does not conform to policy'));
    await expect(first.complete('short')).rejects.toThrow('Password does not conform to policy');
  });

  it('signIn surfaces SOFTWARE_TOKEN_MFA and completes with a code', async () => {
    sdk.__setChallenge('totpRequired');
    sdk.__setSession('post-totp-token');

    const first = await signIn('admin@benkile.com', 'password');
    expect(first.kind).toBe('totpRequired');
    if (first.kind !== 'totpRequired') throw new Error('unreachable');

    await expect(first.complete('123456')).resolves.toEqual({
      kind: 'success',
      idToken: 'post-totp-token',
    });
  });

  it('signIn surfaces MFA_SETUP with the shared secret and verifies to success (prod pool)', async () => {
    sdk.__setChallenge('mfaSetup');
    sdk.__setSession('post-setup-token');

    const first = await signIn('admin@benkile.com', 'password');
    expect(first.kind).toBe('totpSetupRequired');
    if (first.kind !== 'totpSetupRequired') throw new Error('unreachable');
    expect(first.secret).toBe('MOCKSECRET234567');

    await expect(first.complete('654321')).resolves.toEqual({
      kind: 'success',
      idToken: 'post-setup-token',
    });
  });

  it('signIn rejects when authentication fails', async () => {
    sdk.__setAuthError(new Error('Incorrect username or password.'));
    await expect(signIn('admin@benkile.com', 'wrong')).rejects.toThrow(
      'Incorrect username or password.',
    );
  });

  it('getIdToken returns null when no user is signed in', async () => {
    await expect(getIdToken()).resolves.toBeNull();
  });

  it('getIdToken returns the token for a valid persisted session', async () => {
    sdk.__setSignedIn('persisted-token');
    await expect(getIdToken()).resolves.toBe('persisted-token');
  });

  it('getIdToken returns null when the persisted session is invalid', async () => {
    sdk.__setSignedIn('stale-token', false);
    await expect(getIdToken()).resolves.toBeNull();
  });

  it('getIdToken returns null when the session refresh errors', async () => {
    sdk.__setSessionError(new Error('refresh failed'));
    await expect(getIdToken()).resolves.toBeNull();
  });

  it('signOut is a no-op when no user is signed in', () => {
    expect(() => signOut()).not.toThrow();
  });

  it('requestPasswordReset resolves once the verification code is sent', async () => {
    await expect(requestPasswordReset('admin@benkile.com')).resolves.toBeUndefined();
  });

  it('requestPasswordReset surfaces the Cognito error (e.g. unfinished invite)', async () => {
    sdk.__setAuthError(new Error('User password cannot be reset in the current state.'));
    await expect(requestPasswordReset('admin@benkile.com')).rejects.toThrow(
      'User password cannot be reset in the current state.',
    );
  });

  it('confirmPasswordReset resolves on a valid code and new password', async () => {
    await expect(
      confirmPasswordReset('admin@benkile.com', '123456', 'New-Password-123!'),
    ).resolves.toBeUndefined();
  });

  it('confirmPasswordReset surfaces the Cognito error on a bad code', async () => {
    sdk.__setAuthError(new Error('Invalid verification code provided, please try again.'));
    await expect(
      confirmPasswordReset('admin@benkile.com', '000000', 'New-Password-123!'),
    ).rejects.toThrow('Invalid verification code provided, please try again.');
  });
});
