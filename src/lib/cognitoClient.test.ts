import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as cognitoSdk from 'amazon-cognito-identity-js';

// Drive the real cognitoClient wrapper through the manual SDK mock (login flow, §5.2).
vi.mock('amazon-cognito-identity-js');

import { signIn, getIdToken, signOut } from './cognitoClient';

// Mock-only helpers — see __mocks__/amazon-cognito-identity-js.ts.
const sdk = cognitoSdk as unknown as {
  __reset: () => void;
  __setSession: (idToken: string, valid?: boolean) => void;
  __setAuthError: (error: Error | null) => void;
  __setSignedIn: (idToken?: string, valid?: boolean) => void;
  __setSessionError: (error: Error) => void;
};

beforeEach(() => {
  sdk.__reset();
});

describe('cognitoClient', () => {
  it('signIn resolves the id token JWT on successful SRP auth', async () => {
    sdk.__setSession('id-token-123');
    await expect(signIn('admin@benkile.com', 'correct-horse')).resolves.toBe('id-token-123');
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
});
