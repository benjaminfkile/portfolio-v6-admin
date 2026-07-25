import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';

const mockUseAuth = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

function renderWithRouter(initialRoute = '/sections') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/login" element={<div>LoginPage</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/sections" element={<div>SectionsPage</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('shows a spinner while auth is loading', () => {
    mockUseAuth.mockReturnValue({ isLoading: true, currentUser: null });
    renderWithRouter();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('redirects to /login when unauthenticated', () => {
    mockUseAuth.mockReturnValue({ isLoading: false, currentUser: null });
    renderWithRouter();
    expect(screen.getByText('LoginPage')).toBeInTheDocument();
    expect(screen.queryByText('SectionsPage')).not.toBeInTheDocument();
  });

  it('renders the protected route when authenticated', () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      currentUser: { email: 'admin@benkile.com' },
    });
    renderWithRouter();
    expect(screen.getByText('SectionsPage')).toBeInTheDocument();
  });
});
