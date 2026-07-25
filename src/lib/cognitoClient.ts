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

/** Sign in via SRP and resolve the ID token JWT string. */
export function signIn(email: string, password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: getUserPool() });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });
    user.authenticateUser(authDetails, {
      onSuccess: (session: CognitoUserSession) => resolve(session.getIdToken().getJwtToken()),
      onFailure: reject,
    });
  });
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
