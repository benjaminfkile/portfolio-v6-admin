import { vi } from 'vitest';

// Manual mock for the Cognito SDK, following the pattern from
// FileManager/src/__mocks__/amazon-cognito-identity-js.ts (adapted to Vitest). AWS is
// unreachable by design in this environment (agent-pre-checks §7), so every test that
// touches auth drives the flow through this mock instead of a live pool.
//
// Vitest resolves this file for `vi.mock('amazon-cognito-identity-js')` because it lives
// in a `__mocks__` directory adjacent to `node_modules`. The `__*` helpers let a test
// stage the outcome of `authenticateUser` / `getSession` without reaching into internals.

interface FakeSession {
  isValid: () => boolean;
  getIdToken: () => { getJwtToken: () => string };
}

function makeSession(idToken: string, valid = true): FakeSession {
  return {
    isValid: () => valid,
    getIdToken: () => ({ getJwtToken: () => idToken }),
  };
}

interface FakeCurrentUser {
  getSession: (cb: (err: Error | null, session: FakeSession | null) => void) => void;
  signOut: () => void;
}

const state: {
  authError: Error | null;
  session: FakeSession;
  currentUser: FakeCurrentUser | null;
} = {
  authError: null,
  session: makeSession('default-id-token'),
  currentUser: null,
};

/** Reset all staged auth state — call in `beforeEach`. */
export function __reset(): void {
  state.authError = null;
  state.session = makeSession('default-id-token');
  state.currentUser = null;
}

/** Stage the session `authenticateUser().onSuccess` resolves with. */
export function __setSession(idToken: string, valid = true): void {
  state.session = makeSession(idToken, valid);
}

/** Stage an `authenticateUser().onFailure` error (sign-in failure). */
export function __setAuthError(error: Error | null): void {
  state.authError = error;
}

/** Stage an existing persisted session so `getCurrentUser()` returns a signed-in user. */
export function __setSignedIn(idToken = 'default-id-token', valid = true): void {
  state.currentUser = {
    getSession: (cb) => cb(null, makeSession(idToken, valid)),
    signOut: vi.fn(),
  };
}

/** Stage a `getSession` failure for the persisted user. */
export function __setSessionError(error: Error): void {
  state.currentUser = {
    getSession: (cb) => cb(error, null),
    signOut: vi.fn(),
  };
}

export const CognitoUserPool = vi.fn().mockImplementation(() => ({
  getCurrentUser: () => state.currentUser,
  signUp: vi.fn(),
}));

export const CognitoUser = vi.fn().mockImplementation(() => ({
  authenticateUser: vi.fn(
    (_details: unknown, callbacks: { onSuccess: (s: FakeSession) => void; onFailure: (e: Error) => void }) => {
      if (state.authError) callbacks.onFailure(state.authError);
      else callbacks.onSuccess(state.session);
    },
  ),
  getSession: vi.fn((cb: (err: Error | null, session: FakeSession | null) => void) =>
    cb(null, state.session),
  ),
  signOut: vi.fn(),
  confirmRegistration: vi.fn(),
  forgotPassword: vi.fn(),
  confirmPassword: vi.fn(),
}));

export const AuthenticationDetails = vi.fn();
export const CognitoUserAttribute = vi.fn();
export const CognitoUserSession = vi.fn();
