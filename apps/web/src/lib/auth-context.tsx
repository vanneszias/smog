import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type WorkOSUser = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
};

type AuthContextType = {
  user: WorkOSUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: () => void;
  signOut: () => void;
  accessToken: string | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = "smog_web_user";
const TOKEN_STORAGE_KEY = "smog_web_token";

// WorkOS OAuth configuration
const WORKOS_CLIENT_ID = import.meta.env.VITE_WORKOS_CLIENT_ID || "";
const WORKOS_REDIRECT_URI = import.meta.env.VITE_WORKOS_REDIRECT_URI
  ? `${window.location.origin}${import.meta.env.VITE_WORKOS_REDIRECT_URI}`
  : `${window.location.origin}/auth/callback`;
const WORKOS_AUTH_URL = "https://api.workos.com/user_management/authorize";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<WorkOSUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored user and token
    const storedUser = localStorage.getItem(USER_STORAGE_KEY);
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);

    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
      setAccessToken(storedToken);
    }
    setIsLoading(false);
  }, []);

  const signIn = useCallback(() => {
    // Redirect to WorkOS OAuth
    const authUrl = new URL(WORKOS_AUTH_URL);
    authUrl.searchParams.set("client_id", WORKOS_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", WORKOS_REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("provider", "authkit");

    window.location.href = authUrl.toString();
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      signIn,
      signOut,
      accessToken,
    }),
    [user, isLoading, signIn, signOut, accessToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

// Helper to set auth data after OAuth callback
export function setAuthData(user: WorkOSUser, token: string) {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}
