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
  challenge: 'newPasswordRequired' | 'totpRequired' | 'mfaSetup' | null;
  challengeUserAttributes: Record<string, string>;
  challengeRequiredAttributes: string[];
  lastNewPasswordAttrs: Record<string, string> | null;
  totpSecret: string;
} = {
  authError: null,
  session: makeSession('default-id-token'),
  currentUser: null,
  challenge: null,
  challengeUserAttributes: { email: 'x@y.z' },
  challengeRequiredAttributes: [],
  lastNewPasswordAttrs: null,
  totpSecret: 'MOCKSECRET234567',
};

/** Reset all staged auth state — call in `beforeEach`. */
export function __reset(): void {
  state.authError = null;
  state.session = makeSession('default-id-token');
  state.currentUser = null;
  state.challenge = null;
  state.challengeUserAttributes = { email: 'x@y.z' };
  state.challengeRequiredAttributes = [];
  state.lastNewPasswordAttrs = null;
  state.totpSecret = 'MOCKSECRET234567';
}

/**
 * Stage the FIRST authenticateUser call to fire a challenge callback. The
 * follow-up call (completeNewPasswordChallenge / sendMFACode /
 * verifySoftwareToken) then honors the remaining staged state: a staged
 * authError fails it, otherwise it succeeds with the staged session.
 */
export function __setChallenge(
  challenge: 'newPasswordRequired' | 'totpRequired' | 'mfaSetup',
): void {
  state.challenge = challenge;
}

/**
 * Stage the (userAttributes, requiredAttributes) a NEW_PASSWORD_REQUIRED
 * challenge hands its callback — mirrors the SDK, which passes the profile
 * snapshot plus the prefix-stripped names of pool-required attributes.
 */
export function __setNewPasswordChallengeAttributes(
  userAttributes: Record<string, string>,
  requiredAttributes: string[],
): void {
  state.challengeUserAttributes = userAttributes;
  state.challengeRequiredAttributes = requiredAttributes;
}

/** The attribute map the last completeNewPasswordChallenge call sent, or null. */
export function __getLastNewPasswordAttrs(): Record<string, string> | null {
  return state.lastNewPasswordAttrs;
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

interface AuthCallbacks {
  onSuccess: (s: FakeSession) => void;
  onFailure: (e: Error) => void;
  newPasswordRequired?: (userAttributes: Record<string, string>, required: string[]) => void;
  totpRequired?: (challengeName: string, params: Record<string, string>) => void;
  mfaSetup?: (challengeName: string, params: Record<string, string>) => void;
}

/** Settle a follow-up step per remaining staged state (error wins, else session). */
function settleStep(callbacks: Pick<AuthCallbacks, 'onSuccess' | 'onFailure'>): void {
  if (state.authError) callbacks.onFailure(state.authError);
  else callbacks.onSuccess(state.session);
}

export const CognitoUser = vi.fn().mockImplementation(() => ({
  authenticateUser: vi.fn((_details: unknown, callbacks: AuthCallbacks) => {
    if (state.challenge === 'newPasswordRequired' && callbacks.newPasswordRequired) {
      state.challenge = null;
      return callbacks.newPasswordRequired(
        state.challengeUserAttributes,
        state.challengeRequiredAttributes,
      );
    }
    if (state.challenge === 'totpRequired' && callbacks.totpRequired) {
      state.challenge = null;
      return callbacks.totpRequired('SOFTWARE_TOKEN_MFA', {});
    }
    if (state.challenge === 'mfaSetup' && callbacks.mfaSetup) {
      state.challenge = null;
      return callbacks.mfaSetup('MFA_SETUP', {});
    }
    settleStep(callbacks);
  }),
  completeNewPasswordChallenge: vi.fn(
    (_newPassword: string, attrs: Record<string, string>, callbacks: AuthCallbacks) => {
      state.lastNewPasswordAttrs = attrs;
      // A staged second challenge lets tests chain new-password -> TOTP setup.
      if (state.challenge === 'mfaSetup' && callbacks.mfaSetup) {
        state.challenge = null;
        return callbacks.mfaSetup('MFA_SETUP', {});
      }
      settleStep(callbacks);
    },
  ),
  sendMFACode: vi.fn((_code: string, callbacks: AuthCallbacks, _mfaType?: string) =>
    settleStep(callbacks),
  ),
  associateSoftwareToken: vi.fn(
    (callbacks: { associateSecretCode: (secret: string) => void; onFailure: (e: Error) => void }) =>
      callbacks.associateSecretCode(state.totpSecret),
  ),
  verifySoftwareToken: vi.fn(
    (_code: string, _name: string, callbacks: { onSuccess: (s: FakeSession) => void; onFailure: (e: Error) => void }) =>
      settleStep(callbacks),
  ),
  getSession: vi.fn((cb: (err: Error | null, session: FakeSession | null) => void) =>
    cb(null, state.session),
  ),
  signOut: vi.fn(),
  confirmRegistration: vi.fn(),
  forgotPassword: vi.fn(
    (cb: {
      inputVerificationCode?: () => void;
      onSuccess: () => void;
      onFailure: (e: Error) => void;
    }) => {
      if (state.authError) return cb.onFailure(state.authError);
      // The real SDK fires inputVerificationCode once the code email is sent.
      if (cb.inputVerificationCode) return cb.inputVerificationCode();
      cb.onSuccess();
    },
  ),
  confirmPassword: vi.fn(
    (
      _code: string,
      _newPassword: string,
      cb: { onSuccess: () => void; onFailure: (e: Error) => void },
    ) => {
      if (state.authError) return cb.onFailure(state.authError);
      cb.onSuccess();
    },
  ),
}));

export const AuthenticationDetails = vi.fn();
export const CognitoUserAttribute = vi.fn();
export const CognitoUserSession = vi.fn();
