import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name: string | null;
}

interface OnboardingState {
  project: {
    id: string;
    name: string;
    slug: string;
  };
  apiKey: string;
  apiKeyMasked: string;
  endpointPath: string;
  apiKeyHeader: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  onboarding: OnboardingState | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string, refreshToken?: string | null, onboarding?: OnboardingState | null) => void;
  setOnboarding: (onboarding: OnboardingState | null) => void;
  clearOnboarding: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      onboarding: null,
      isAuthenticated: false,
      setAuth: (user, token, refreshToken = null, onboarding = null) =>
        set({
          user,
          accessToken: token,
          refreshToken,
          onboarding,
          isAuthenticated: true,
        }),
      setOnboarding: (onboarding) => set({ onboarding }),
      clearOnboarding: () => set({ onboarding: null }),
      logout: () => set({ user: null, accessToken: null, refreshToken: null, onboarding: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage',
    }
  )
);
