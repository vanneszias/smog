import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAction, useMutation, useQuery } from "convex/react";
import { makeRedirectUri, useAuthRequest } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { generateGuestId } from "@/services/userService";

WebBrowser.maybeCompleteAuthSession();

type AuthMode = "guest" | "authenticated" | "loading";

type WorkOSUser = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
};

type AuthContextType = {
  authMode: AuthMode;
  isGuest: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: WorkOSUser | null;
  userId: Id<"users"> | null;
  guestId: string | null;
  continueAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  clearGuestMode: () => Promise<void>;
  signIn: () => void;
  signUp: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const GUEST_MODE_KEY = "@smog_guest_mode";
const GUEST_ID_KEY = "@smog_guest_id";
const USER_KEY = "@smog_user";

// WorkOS OAuth discovery configuration
const discovery = {
  authorizationEndpoint: "https://api.workos.com/user_management/authorize",
  tokenEndpoint: "https://api.workos.com/user_management/token",
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isOffline } = useNetworkStatus();
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [isInitialized, setIsInitialized] = useState(false);
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [user, setUser] = useState<WorkOSUser | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const createUser = useMutation(api.users.createUser);
  const migrateGuestToUser = useMutation(api.users.migrateGuestToUser);
  const exchangeCode = useAction(api.users.exchangeCodeForToken);
  const getUserByWorkOSId = useQuery(
    api.users.getUserByWorkOSId,
    user?.id ? { workosId: user.id } : "skip"
  );
  const getUserByGuestId = useQuery(
    api.users.getUserByGuestId,
    guestId ? { guestId } : "skip"
  );

  // WorkOS OAuth setup
  const redirectUri = makeRedirectUri({
    scheme: "smog",
    path: "auth-callback",
  });

  const clientId = process.env.EXPO_PUBLIC_WORKOS_CLIENT_ID;

  console.log("[AuthContext] OAuth config:", {
    clientId: clientId ? `${clientId.substring(0, 10)}...` : "NOT SET",
    redirectUri,
  });

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: clientId || "",
      scopes: [],
      redirectUri,
      responseType: "code",
      extraParams: {
        provider: "authkit",
      },
    },
    discovery
  );

  const exchangeCodeForUser = useCallback(
    async (code: string, _state?: string) => {
      try {
        console.log("[AuthContext] Exchanging code for user...");

        // Exchange the authorization code for user info via Convex action
        const workosUser = await exchangeCode({
          code,
          redirectUri,
        });

        const user: WorkOSUser = {
          id: workosUser.workosId,
          email: workosUser.email,
          firstName: workosUser.firstName,
          lastName: workosUser.lastName,
        };

        console.log("[AuthContext] WorkOS user authenticated:", user.email);
        setUser(user);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
        setAuthMode("authenticated");

        // Clear guest mode when user signs in
        await AsyncStorage.removeItem(GUEST_MODE_KEY);
        await AsyncStorage.removeItem(GUEST_ID_KEY);
        setGuestId(null);

        console.log("[AuthContext] User authentication completed");
      } catch (error) {
        console.error("Error exchanging code for user:", error);
      }
    },
    [exchangeCode, redirectUri]
  );

  // Handle OAuth response
  useEffect(() => {
    if (response?.type === "success") {
      const { code, state } = response.params;
      console.log("[AuthContext] OAuth success, received code:", code);
      exchangeCodeForUser(code, state);
    } else if (response?.type === "error") {
      console.error("[AuthContext] OAuth error:", response.error);
    }
  }, [response, exchangeCodeForUser]);

  const initializeAuth = useCallback(async () => {
    try {
      const guestMode = await AsyncStorage.getItem(GUEST_MODE_KEY);
      const storedGuestId = await AsyncStorage.getItem(GUEST_ID_KEY);
      const storedUser = await AsyncStorage.getItem(USER_KEY);

      let newAuthMode: AuthMode;

      if (storedUser) {
        console.log(
          "[AuthContext] User found in storage during initialization"
        );
        setUser(JSON.parse(storedUser));
        newAuthMode = "authenticated";
      } else if (guestMode === "true") {
        console.log("[AuthContext] User in guest mode during initialization");
        newAuthMode = "guest";
        if (storedGuestId) {
          setGuestId(storedGuestId);
        } else {
          // Generate new guest ID if not exists
          const newGuestId = generateGuestId();
          setGuestId(newGuestId);
          await AsyncStorage.setItem(GUEST_ID_KEY, newGuestId);
        }
      } else {
        console.log("[AuthContext] No auth state, setting to loading");
        newAuthMode = "loading"; // Show welcome screen with options
      }

      console.log(`[AuthContext] Initial auth mode set to: ${newAuthMode}`);
      setAuthMode(newAuthMode);
      setIsInitialized(true);
    } catch (error) {
      console.error("Error checking auth state:", error);
      setAuthMode("loading");
      setIsInitialized(true);
    }
  }, []);

  // Initialize auth state - handle both online and offline scenarios
  useEffect(() => {
    if (isInitialized) {
      return;
    }

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Initialize immediately (no external SDK to wait for)
    initializeAuth();

    // Cleanup timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isInitialized, initializeAuth]);

  // Handle user creation/migration when auth state changes
  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    // Skip Convex operations when offline
    if (isOffline) {
      console.log(
        "[AuthContext] Offline mode - skipping Convex user operations"
      );
      return;
    }

    const handleAuthenticatedUser = async () => {
      if (getUserByWorkOSId && getUserByWorkOSId !== null) {
        setUserId(getUserByWorkOSId._id);
        return;
      }

      if (getUserByWorkOSId === null) {
        const storedGuestId = await AsyncStorage.getItem(GUEST_ID_KEY);
        if (storedGuestId) {
          const userId = await migrateGuestToUser({
            guestId: storedGuestId,
            workosId: user?.id,
          });
          setUserId(userId);
        } else {
          const userId = await createUser({ workosId: user?.id });
          setUserId(userId);
        }
      }
    };

    const handleGuestUser = async () => {
      if (!guestId) {
        return;
      }

      if (getUserByGuestId && getUserByGuestId !== null) {
        setUserId(getUserByGuestId._id);
      } else if (getUserByGuestId === null) {
        const newUserId = await createUser({ guestId });
        setUserId(newUserId);
      }
    };

    const handleUserSetup = async () => {
      if (user?.id && authMode === "authenticated") {
        await handleAuthenticatedUser();
      } else if (authMode === "guest" && guestId) {
        await handleGuestUser();
      }
    };

    handleUserSetup().catch(console.error);
  }, [
    user,
    authMode,
    guestId,
    getUserByWorkOSId,
    getUserByGuestId,
    isInitialized,
    isOffline,
    createUser,
    migrateGuestToUser,
  ]);

  const continueAsGuest = useCallback(async () => {
    try {
      // Generate or retrieve guest ID
      let currentGuestId = await AsyncStorage.getItem(GUEST_ID_KEY);
      if (!currentGuestId) {
        currentGuestId = generateGuestId();
        await AsyncStorage.setItem(GUEST_ID_KEY, currentGuestId);
      }

      await AsyncStorage.setItem(GUEST_MODE_KEY, "true");
      setGuestId(currentGuestId);
      setAuthMode("guest");
    } catch (error) {
      console.error("Error setting guest mode:", error);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      // Clear all auth data
      await AsyncStorage.removeItem(USER_KEY);
      await AsyncStorage.removeItem(GUEST_MODE_KEY);
      await AsyncStorage.removeItem(GUEST_ID_KEY);
      setAuthMode("loading");
      setUserId(null);
      setGuestId(null);
      setUser(null);
    } catch (error) {
      console.error("Error during sign out:", error);
    }
  }, []);

  const clearGuestMode = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(GUEST_MODE_KEY);
      await AsyncStorage.removeItem(GUEST_ID_KEY);
      setAuthMode("loading");
      setUserId(null);
      setGuestId(null);
    } catch (error) {
      console.error("Error clearing guest mode:", error);
    }
  }, []);

  // Trigger OAuth flow for sign in
  const signIn = useCallback(() => {
    if (request) {
      console.log("[AuthContext] Starting WorkOS OAuth sign-in flow");
      console.log("[AuthContext] Redirect URI:", redirectUri);
      promptAsync();
    } else {
      console.error("[AuthContext] OAuth request not ready");
    }
  }, [request, promptAsync, redirectUri]);

  // For sign up, we use the same OAuth flow
  const signUp = useCallback(() => {
    if (request) {
      console.log("[AuthContext] Starting WorkOS OAuth sign-up flow");
      console.log("[AuthContext] Redirect URI:", redirectUri);
      promptAsync();
    } else {
      console.error("[AuthContext] OAuth request not ready");
    }
  }, [request, promptAsync, redirectUri]);

  const value: AuthContextType = useMemo(
    () => ({
      authMode,
      isGuest: authMode === "guest",
      isAuthenticated: authMode === "authenticated",
      isLoading: !isInitialized,
      user,
      userId,
      guestId,
      continueAsGuest,
      signOut,
      clearGuestMode,
      signIn,
      signUp,
    }),
    [
      authMode,
      isInitialized,
      user,
      userId,
      guestId,
      continueAsGuest,
      signOut,
      clearGuestMode,
      signIn,
      signUp,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
