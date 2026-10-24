import { createAccountRouter } from "@smog/account/server";
import {
  createAdminRouter,
  createCatalogTranslationRouter,
} from "@smog/admin/server";
import { publicAuthConfig } from "@smog/config/env/worker";
import { uiCatalogueSource } from "@smog/db";
import {
  createFavoritesRouter,
  insertFavoritesStmt,
} from "@smog/favorites/server";
import {
  bumpCatalogVersion,
  findGesturesByIds,
  gesturesRouter,
} from "@smog/gestures/server";
import { resolveLocale } from "@smog/i18n";
import { loadCatalogue } from "@smog/i18n/server";
import { createLessonsRouter, createTeacherRouter } from "@smog/lessons/server";
import {
  appendItemsStmt,
  createListsRouter,
  insertListsStmt,
  shareUrl,
  touchListsWithNewItemsStmt,
  unplacedItemsStmt,
} from "@smog/lists/server";
import { implementRpc } from "@smog/rpc";
import { roleSchema } from "@smog/rpc/contract";
import { createSponsorshipsRouter } from "@smog/sponsorships/server";
import { createTranslationRouter } from "@smog/translation/server";
import { adminSponsorshipServices } from "./admin-deps";
import { appContract } from "./contract";

const os = implementRpc(appContract);

/** What the admin procedures inject from other features' servers. */
const adminDeps = {
  bumpCatalogVersion,
  sponsorships: adminSponsorshipServices,
};

const system = os.system.router({
  authConfig: os.system.authConfig.handler(({ context }) =>
    publicAuthConfig(context.env)
  ),
  health: os.system.health.handler(({ context }) => ({
    environment: context.env.ENVIRONMENT,
    ok: true as const,
  })),
  i18n: os.system.i18n.handler(async ({ context, input }) => {
    const catalogue = await loadCatalogue(
      { kv: context.kv, source: uiCatalogueSource(context.db) },
      (enabled, fallback) =>
        resolveLocale({ preference: input.locale }, enabled, fallback)
    );
    return {
      languages: [...catalogue.languages],
      locale: catalogue.locale,
      overlay: catalogue.overlay,
      version: catalogue.version,
    };
  }),
  whoami: os.system.whoami.handler(({ context }) => {
    const user = context.session?.user;
    return {
      user: user
        ? {
            email: user.email,
            id: user.id,
            image: user.image ?? null,
            name: user.name,
            role: roleSchema.parse(user.role),
            roles: user.roles,
          }
        : null,
    };
  }),
});

/** The app router: implements `appContract` (feature routers join here). */
export const appRouter = os.router({
  // The guest import writes through the favorites and lists builders; the
  // export builds share links with the lists' URL.
  account: createAccountRouter({
    appendItems: appendItemsStmt,
    insertFavorites: insertFavoritesStmt,
    insertLists: insertListsStmt,
    shareUrl,
    touchLists: touchListsWithNewItemsStmt,
    unplacedItems: unplacedItemsStmt,
  }),
  // Admin catalogue writes start a new catalogue version (the gestures
  // cache); the sponsorship actions run the sponsorship batches and enqueue
  // on the rpc env's queues after the commit. Every admin procedure is
  // `requireAdmin`.
  admin: createAdminRouter(adminDeps),
  // The gesture and category translations: open to a translator (an admin
  // passes too), with the admin audit guard on every write.
  catalogTranslation: createCatalogTranslationRouter(adminDeps),
  // Favorites and lists resolve summaries with the gestures query (a
  // feature never imports another feature's server; the api wires them).
  favorites: createFavoritesRouter({ findSummaries: findGesturesByIds }),
  gestures: gesturesRouter,
  // Lessons (phase 10c task 4): teachers and admins; author-only writes.
  lessons: createLessonsRouter(),
  lists: createListsRouter({ findSummaries: findGesturesByIds }),
  // Public: every procedure runs its declared guards (Turnstile,
  // RL_SPONSOR). Tasks 4 and 5 fill the checkout, logo, status, re-edit
  // and renewal slices.
  sponsorships: createSponsorshipsRouter(),
  system,
  // Teacher information (phase 10c): teachers, translators and admins; each
  // procedure carries its role guard and the audit guard.
  teacher: createTeacherRouter(),
  // Translators and admins: the strings, languages and coverage. Each
  // procedure carries its role guard and the audit guard.
  translation: createTranslationRouter(),
});

export type AppRouter = typeof appRouter;
