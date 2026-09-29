/**
 * Type-level guard (compiled by `tsconfig.client.json`): the clients infer
 * our additional user fields from `USER_ADDITIONAL_FIELDS`.
 */
import type { createExpoAuthClient } from "../src/expo";
import type { FlowAuthClient } from "../src/flow-actions";
import type { createWebAuthClient } from "../src/web";

type WebUser = ReturnType<
  typeof createWebAuthClient
>["$Infer"]["Session"]["user"];
type ExpoUser = ReturnType<
  typeof createExpoAuthClient
>["$Infer"]["Session"]["user"];

export const webLocale: WebUser["locale"] = "nl";
export const expoLocale: ExpoUser["locale"] = "fr";
export const webLegacyId: WebUser["legacyId"] = null;

/** Both clients satisfy the flow's structural client (`createFlowActions`). */
export function flowClients(
  web: ReturnType<typeof createWebAuthClient>,
  expo: ReturnType<typeof createExpoAuthClient>
): FlowAuthClient[] {
  return [web, expo];
}
