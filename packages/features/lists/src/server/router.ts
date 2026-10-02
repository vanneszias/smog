import { implementRpc, requireUser } from "@smog/rpc";
import { listsContract } from "../contract";
import {
  addItem,
  createList,
  deleteList,
  type FindGestureSummaries,
  getList,
  ListsError,
  type ListsErrorCode,
  listMine,
  listsContaining,
  removeItem,
  reorderList,
  updateList,
} from "./service";
import {
  addSharedItem,
  createShareLink,
  getSharedList,
  getShareLinks,
  removeSharedItem,
  revokeShareLink,
} from "./sharing";

export interface ListsRouterDeps {
  /** `@smog/gestures/server` `findGesturesByIds` (wired by `@smog/api`). */
  findSummaries: FindGestureSummaries;
}

type ErrorFactories = Record<ListsErrorCode, () => Error>;

/** Runs a service call, turning its `ListsError` into the contract error. */
async function mapped<T>(
  errors: ErrorFactories,
  run: () => Promise<T>
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ListsError) {
      throw errors[error.code]();
    }
    throw error;
  }
}

/**
 * The `lists` slice of the app router. Owner procedures and shared edits
 * use `requireUser`; `shared.get` is public. Gesture summaries come from
 * the injected `findSummaries`, so lists never import `@smog/gestures`'s
 * server.
 */
export function createListsRouter(deps: ListsRouterDeps) {
  const os = implementRpc(listsContract);
  const withDb = (db: Parameters<FindGestureSummaries>[0]) => ({
    db,
    findSummaries: deps.findSummaries,
  });

  return os.router({
    // Analytics: gesture_collection_changed is sent by the client (useList, useSharedList).
    addItem: os.addItem
      .use(requireUser)
      .handler(({ context, errors, input }) =>
        mapped(errors, () => addItem(context.db, context.user.id, input))
      ),

    containing: os.containing
      .use(requireUser)
      .handler(({ context, input }) =>
        listsContaining(context.db, context.user.id, input.gestureId)
      ),

    create: os.create
      .use(requireUser)
      .handler(({ context, errors, input }) =>
        mapped(errors, () => createList(context.db, context.user.id, input))
      ),

    delete: os.delete
      .use(requireUser)
      .handler(({ context, errors, input }) =>
        mapped(errors, () => deleteList(context.db, context.user.id, input.id))
      ),

    get: os.get
      .use(requireUser)
      .handler(({ context, errors, input }) =>
        mapped(errors, () =>
          getList(withDb(context.db), context.user.id, input.id)
        )
      ),

    mine: os.mine
      .use(requireUser)
      .handler(({ context }) => listMine(context.db, context.user.id)),

    removeItem: os.removeItem
      .use(requireUser)
      .handler(({ context, errors, input }) =>
        mapped(errors, () => removeItem(context.db, context.user.id, input))
      ),

    reorder: os.reorder
      .use(requireUser)
      .handler(({ context, errors, input }) =>
        mapped(errors, () => reorderList(context.db, context.user.id, input))
      ),

    share: {
      create: os.share.create
        .use(requireUser)
        .handler(({ context, errors, input }) =>
          mapped(errors, () =>
            createShareLink(context.db, context.user.id, {
              ...input,
              siteUrl: context.env.SITE_URL,
            })
          )
        ),
      get: os.share.get.use(requireUser).handler(({ context, errors, input }) =>
        mapped(errors, () =>
          getShareLinks(context.db, context.user.id, {
            id: input.id,
            siteUrl: context.env.SITE_URL,
          })
        )
      ),
      revoke: os.share.revoke
        .use(requireUser)
        .handler(({ context, errors, input }) =>
          mapped(errors, () =>
            revokeShareLink(context.db, context.user.id, input)
          )
        ),
    },

    shared: {
      addItem: os.shared.addItem
        .use(requireUser)
        .handler(({ context, errors, input }) =>
          mapped(errors, () =>
            addSharedItem(context.db, context.user.id, input)
          )
        ),
      get: os.shared.get.handler(({ context, errors, input }) =>
        mapped(errors, () =>
          getSharedList(withDb(context.db), {
            locale: context.locale,
            token: input.token,
          })
        )
      ),
      removeItem: os.shared.removeItem
        .use(requireUser)
        .handler(({ context, errors, input }) =>
          mapped(errors, () => removeSharedItem(context.db, input))
        ),
    },

    update: os.update
      .use(requireUser)
      .handler(({ context, errors, input }) =>
        mapped(errors, () => updateList(context.db, context.user.id, input))
      ),
  });
}

export type ListsRouter = ReturnType<typeof createListsRouter>;
