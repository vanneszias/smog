import { type ApiClient, createApiClient } from "@smog/api/client";
import { createIsomorphicFn } from "@tanstack/react-start";
import { createInProcessApiClient } from "@/server/in-process-api";

/**
 * The app's oRPC client: in-process on the server (SSR loaders call the
 * procedures directly), `/api/rpc` on this origin in the browser (the
 * session cookie goes along). Query keys are the same on both sides, so
 * the dehydrated SSR cache is what the client hooks read.
 */
export const createAppApiClient = createIsomorphicFn()
  .server((): ApiClient => createInProcessApiClient())
  .client(
    (): ApiClient => createApiClient({ baseUrl: window.location.origin })
  );
