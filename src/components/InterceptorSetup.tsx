import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { setupInterceptors, ejectInterceptor } from '../api/setupInterceptors';

// Wires the 401 refresh/logout response interceptor into the React tree so it can reach
// `logout` and router navigation (ported from FileManager).
export default function InterceptorSetup() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const id = setupInterceptors(logout, navigate);
    return () => ejectInterceptor(id);
  }, [logout, navigate]);

  return null;
}
