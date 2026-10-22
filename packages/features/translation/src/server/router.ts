import { languagesRoutes } from "./languages";
import { translationRouterBuilder } from "./procedure";
import { stringsRoutes } from "./strings";

/**
 * The `translation` slice of the app router. Each procedure carries its own
 * role guard (`translatorProcedure`, `adminOnlyProcedure`) and the audit
 * guard; `router()` checks that together they implement the whole contract.
 */
export function createTranslationRouter() {
  return translationRouterBuilder.router({
    ...languagesRoutes(),
    strings: stringsRoutes(),
  });
}

export type TranslationRouter = ReturnType<typeof createTranslationRouter>;
