import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js';

// Ported from FileManager's src/lib/cognitoClient.ts (spec §5.2). Adapted from CRA's
// REACT_APP_* to Vite's import.meta.env.VITE_* (spec §9.6). SRP auth against the pool
// directly — no hosted UI, no OAuth redirect. The SDK persists the session in
// localStorage and refreshes the id token as needed.
//
// Unlike FileManager (self-signup pool), portfolio v6 users are admin-created
// (spec §5.1: AllowAdminCreateUserOnly) and the prod pool REQUIRES TOTP MFA, so
// sign-in is a small state machine rather than a single call: the first login
// answers a NEW_PASSWORD_REQUIRED challenge, and prod logins answer MFA_SETUP
// (first time) or SOFTWARE_TOKEN_MFA (thereafter). `signIn` surfaces each
// challenge as a value with a `complete` continuation instead of resolving a
// token directly.
//
// The pool is created lazily on first use rather than at import time, so importing this
// module never throws when the env vars are absent (e.g. under test auto-mocking).
let userPool: CognitoUserPool | null = null;

function getUserPool(): CognitoUserPool {
  if (!userPool) {
    userPool = new CognitoUserPool({
      UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID!,
      ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID!,
    });
  }
  return userPool;
}

/** The outcome of a sign-in step: done, or a challenge with a continuation. */
export type SignInResult =
  | { kind: 'success'; idToken: string }
  | {
      /** First login with an admin-issued temporary password (§5.1). */
      kind: 'newPasswordRequired';
      /**
       * Pool-required attributes the challenge demands a value for and the
       * user's profile doesn't have (e.g. given_name on an invite that didn't
       * set it). The UI must collect these and pass them to `complete`.
       */
      missingAttributes: string[];
      complete: (
        newPassword: string,
        attributes?: Record<string, string>,
      ) => Promise<SignInResult>;
    }
  | {
      /** Pool requires TOTP and this user has not enrolled yet (prod, §5.1). */
      kind: 'totpSetupRequired';
      /** Base32 secret to add to an authenticator app. */
      secret: string;
      complete: (code: string) => Promise<SignInResult>;
    }
  | {
      /** User is enrolled in TOTP; a current code is needed. */
      kind: 'totpRequired';
      complete: (code: string) => Promise<SignInResult>;
    };

/**
 * Sign in via SRP. Resolves `{ kind: 'success', idToken }` or a challenge whose
 * `complete()` continues the same flow (and may itself yield another challenge —
 * e.g. new-password then TOTP setup on the prod pool).
 */
export function signIn(email: string, password: string): Promise<SignInResult> {
  const user = new CognitoUser({ Username: email, Pool: getUserPool() });
  const authDetails = new AuthenticationDetails({ Username: email, Password: password });

  // One settle-slot shared by every step of the flow: each step creates a fresh
  // promise, and whichever SDK callback fires next resolves it. This lets the
  // same callbacks object serve authenticateUser, completeNewPasswordChallenge,
  // and sendMFACode, chaining challenges in whatever order the pool demands.
  let settle: { resolve: (r: SignInResult) => void; reject: (e: unknown) => void };
  const nextStep = () =>
    new Promise<SignInResult>((resolve, reject) => {
      settle = { resolve, reject };
    });

  const callbacks = {
    onSuccess: (session: CognitoUserSession) =>
      settle.resolve({ kind: 'success', idToken: session.getIdToken().getJwtToken() }),
    onFailure: (err: unknown) => settle.reject(err),

    newPasswordRequired: (
      userAttributes: Record<string, string> | null,
      requiredAttributes: string[],
    ) => {
      settle.resolve({
        kind: 'newPasswordRequired',
        missingAttributes: requiredAttributes.filter((name) => !userAttributes?.[name]),
        complete: (newPassword: string, attributes: Record<string, string> = {}) => {
          const step = nextStep();
          // Cognito demands a value for exactly the names in requiredAttributes:
          // omitting one fails with "Invalid attributes given, X is missing",
          // while sending anything extra (especially email_verified, which the
          // challenge's userAttributes includes) also makes it reject the call.
          // Send precisely that set — form input first, existing profile value
          // as the fallback.
          const required: Record<string, string> = {};
          for (const name of requiredAttributes) {
            const value = attributes[name] ?? userAttributes?.[name];
            if (value) required[name] = value;
          }
          user.completeNewPasswordChallenge(newPassword, required, callbacks);
          return step;
        },
      });
    },

    totpRequired: () => {
      settle.resolve({
        kind: 'totpRequired',
        complete: (code: string) => {
          const step = nextStep();
          user.sendMFACode(code.trim(), callbacks, 'SOFTWARE_TOKEN_MFA');
          return step;
        },
      });
    },

    mfaSetup: () => {
      user.associateSoftwareToken({
        associateSecretCode: (secret: string) => {
          settle.resolve({
            kind: 'totpSetupRequired',
            secret,
            complete: (code: string) => {
              const step = nextStep();
              user.verifySoftwareToken(code.trim(), 'portfolio-v6-admin', {
                onSuccess: (session: CognitoUserSession) =>
                  settle.resolve({
                    kind: 'success',
                    idToken: session.getIdToken().getJwtToken(),
                  }),
                onFailure: (err: unknown) => settle.reject(err),
              });
              return step;
            },
          });
        },
        onFailure: (err: unknown) => settle.reject(err),
      });
    },
  };

  const first = nextStep();
  user.authenticateUser(authDetails, callbacks);
  return first;
}

/** Sign out the current user locally (clears the session from localStorage). */
export function signOut(): void {
  const user = getUserPool().getCurrentUser();
  if (user) user.signOut();
}

/**
 * Returns the current user's ID token JWT string, refreshing if needed.
 * Returns null if no user is signed in or the session cannot be refreshed.
 */
export function getIdToken(): Promise<string | null> {
  return new Promise((resolve) => {
    const user = getUserPool().getCurrentUser();
    if (!user) return resolve(null);
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) return resolve(null);
      resolve(session.getIdToken().getJwtToken());
    });
  });
}
