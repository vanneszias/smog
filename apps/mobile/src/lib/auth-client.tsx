import type { ExpoAuthClient } from "@smog/auth/expo";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";

const AuthClientContext = createContext<ExpoAuthClient | null>(null);

/** Holds the app's one Better Auth Expo client (created by `AppProviders`). */
export function AuthClientProvider({
  children,
  client,
}: {
  children: ReactNode;
  client: ExpoAuthClient;
}): ReactElement {
  return (
    <AuthClientContext.Provider value={client}>
      {children}
    </AuthClientContext.Provider>
  );
}

export function useAuthClient(): ExpoAuthClient {
  const client = useContext(AuthClientContext);
  if (!client) {
    throw new Error(
      "[auth] useAuthClient must be used inside AuthClientProvider"
    );
  }
  return client;
}
