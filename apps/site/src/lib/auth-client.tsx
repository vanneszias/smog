import type { WebAuthClient } from "@smog/auth/web";
import { createContext, type ReactNode, useContext } from "react";

const AuthClientContext = createContext<WebAuthClient | null>(null);

/** Holds the one Better Auth web client (created by the root layout). */
export function AuthClientProvider({
  children,
  client,
}: {
  children: ReactNode;
  client: WebAuthClient;
}): ReactNode {
  return (
    <AuthClientContext.Provider value={client}>
      {children}
    </AuthClientContext.Provider>
  );
}

export function useAuthClient(): WebAuthClient {
  const client = useContext(AuthClientContext);
  if (!client) {
    throw new Error(
      "[auth] useAuthClient must be used inside AuthClientProvider"
    );
  }
  return client;
}
