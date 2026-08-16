import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { signIn, signOut, getIdToken } from '../lib/cognitoClient';

vi.mock('../lib/cognitoClient');
const mockGetIdToken = vi.mocked(getIdToken);
const mockSignIn = vi.mocked(signIn);
const mockSignOut = vi.mocked(signOut);

function TestConsumer() {
  const { currentUser, isLoading, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="user">{currentUser ? currentUser.email || 'authenticated' : 'null'}</span>
      <span data-testid="loading">{String(isLoading)}</span>
      <button onClick={() => login('alice@example.com', 'password123')}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('AuthContext', () => {
  test('renders children', () => {
    mockGetIdToken.mockResolvedValue(null);
    render(
      <AuthProvider>
        <p>hello</p>
      </AuthProvider>,
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  test('restores the session on mount when a Cognito id token exists', async () => {
    mockGetIdToken.mockResolvedValue('jwt-token');

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('user')).not.toHaveTextContent('null');
    expect(mockGetIdToken).toHaveBeenCalledTimes(1);
  });

  test('stays unauthenticated on mount when there is no token', async () => {
    mockGetIdToken.mockResolvedValue(null);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('user')).toHaveTextContent('null');
  });

  test('login signs in via SRP and sets the current user', async () => {
    mockGetIdToken.mockResolvedValue(null);
    mockSignIn.mockResolvedValue({ kind: 'success', idToken: 'jwt-token' });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    await act(async () => {
      screen.getByText('login').click();
    });

    expect(mockSignIn).toHaveBeenCalledWith('alice@example.com', 'password123');
    expect(screen.getByTestId('user')).toHaveTextContent('alice@example.com');
  });

  test('login forwards new-password attributes through the challenge wrapper', async () => {
    // Regression: the wrapper used to re-expose complete as (value) => …,
    // silently dropping the attributes argument — Cognito then failed with
    // "Invalid attributes given, given_name is missing" despite the form
    // collecting the names.
    mockGetIdToken.mockResolvedValue(null);
    const innerComplete = vi
      .fn()
      .mockResolvedValue({ kind: 'success' as const, idToken: 'jwt-token' });
    mockSignIn.mockResolvedValue({
      kind: 'newPasswordRequired',
      missingAttributes: ['given_name', 'family_name'],
      complete: innerComplete,
    });

    let loginResult: Awaited<ReturnType<typeof signIn>> | undefined;
    function ChallengeConsumer() {
      const { login } = useAuth();
      return (
        <button
          onClick={() => {
            void login('alice@example.com', 'temp-password').then((r) => {
              loginResult = r;
            });
          }}
        >
          login
        </button>
      );
    }

    render(
      <AuthProvider>
        <ChallengeConsumer />
      </AuthProvider>,
    );

    await act(async () => {
      screen.getByText('login').click();
    });
    if (loginResult?.kind !== 'newPasswordRequired') throw new Error('expected challenge');

    await act(async () => {
      await loginResult!.complete('New-Password-123!', { given_name: 'Ben', family_name: 'Kile' });
    });
    expect(innerComplete).toHaveBeenCalledWith('New-Password-123!', {
      given_name: 'Ben',
      family_name: 'Kile',
    });
  });

  test('logout signs out and clears the current user', async () => {
    mockGetIdToken.mockResolvedValue('jwt-token');

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('user')).not.toHaveTextContent('null');
    });

    act(() => {
      screen.getByText('logout').click();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(screen.getByTestId('user')).toHaveTextContent('null');
  });
});
