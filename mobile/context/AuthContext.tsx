import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import authService from '../services/auth/authService';
import type { AuthCredentials, ProfileUpdatePayload, RegisterPayload } from '../services/auth/authService';
import type { User } from '../types';
import { OFFLINE_MODE } from '../services/api/config';
import { onSessionCleared } from '../services/api/session';

// ─── Context types ────────────────────────────────────────────────────────────

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: AuthCredentials) => Promise<{ error?: string }>;
  register: (payload: RegisterPayload) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  activatePremium: () => Promise<void>;
  updateProfile: (payload: ProfileUpdatePayload) => Promise<{ error?: string }>;
};

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => OFFLINE_MODE ? undefined : onSessionCleared(() => setUser(null)), []);

  // Restore session on app launch
  useEffect(() => {
    authService
      .getSession()
      .then((storedUser) => {
        setUser(storedUser);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = useCallback(
    async (credentials: AuthCredentials): Promise<{ error?: string }> => {
      const result = await authService.login(credentials);
      if (result.success) {
        setUser(result.data);
        return {};
      }
      return { error: result.error };
    },
    []
  );

  const register = useCallback(
    async (payload: RegisterPayload): Promise<{ error?: string }> => {
      const result = await authService.register(payload);
      if (result.success) {
        setUser(result.data);
        return {};
      }
      return { error: result.error };
    },
    []
  );

  const logout = useCallback(async (): Promise<void> => {
    try { await authService.logout(); } finally { setUser(null); }
  }, []);

  const activatePremium = useCallback(async (): Promise<void> => {
    if (!user) return;
    const updatedUser = await authService.updatePlan(user, 'premium');
    setUser(updatedUser);
  }, [user]);

  const updateProfile = useCallback(async (payload: ProfileUpdatePayload): Promise<{ error?: string }> => {
    if (!user) return { error: 'You need to sign in before editing your profile.' };
    const result = await authService.updateProfile(user, payload);
    if (result.success) {
      setUser(result.data);
      return {};
    }
    return { error: result.error };
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: user !== null,
        login,
        register,
        logout,
        activatePremium,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useAuthContext
 * Provides auth state and actions. Must be used inside <AuthProvider>.
 */
export const useAuthContext = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used within an <AuthProvider>.');
  }
  return ctx;
};

export default AuthContext;
