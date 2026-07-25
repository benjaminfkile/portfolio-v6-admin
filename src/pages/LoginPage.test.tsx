import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';

const mockLogin = vi.fn();
const mockedNavigate = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin, currentUser: null, logout: vi.fn() }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockedNavigate };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LoginPage', () => {
  test('renders email and password fields and a sign-in button', () => {
    renderPage();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  test('submitting calls login with the entered credentials and navigates on success', async () => {
    mockLogin.mockResolvedValue(undefined);
    renderPage();

    await userEvent.type(screen.getByLabelText(/email/i), 'admin@benkile.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'hunter2hunter2');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(mockLogin).toHaveBeenCalledWith('admin@benkile.com', 'hunter2hunter2');
    await vi.waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith('/sections', { replace: true });
    });
  });

  test('shows an error message when login fails and does not navigate', async () => {
    mockLogin.mockRejectedValue(new Error('Incorrect username or password.'));
    renderPage();

    await userEvent.type(screen.getByLabelText(/email/i), 'admin@benkile.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/incorrect username or password/i)).toBeInTheDocument();
    expect(mockedNavigate).not.toHaveBeenCalled();
  });
});
