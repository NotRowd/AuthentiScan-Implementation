import { useAuthContext } from '../context/AuthContext';

/**
 * useAuth
 *
 * Convenience re-export of the auth context hook.
 * Provides: user, isLoading, isAuthenticated, login, register, logout.
 *
 * Usage:
 * ```tsx
 * const { user, login, logout } = useAuth();
 * ```
 */
export const useAuth = useAuthContext;
export default useAuthContext;
