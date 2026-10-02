import { env } from "cloudflare:workers";
import { addCategory } from "../catalog-helpers";
import type { ProcedureInputs } from "./index";

/**
 * For each `admin.categories` procedure, a function from the fixtures to an
 * input the admin call succeeds with (a mutation then proves it built its
 * audit entry).
 */
export const CATEGORIES_INPUTS: ProcedureInputs = {
  "categories.create": () => ({ name: "Auth categorie" }),
  "categories.delete": async () => ({ id: (await addCategory()).id }),
  "categories.list": () => undefined,
  "categories.reorder": async () => {
    // The exact set, as the categories screen sends it.
    const { results } = await env.DB.prepare(
      "SELECT id FROM category ORDER BY sort_order DESC, id"
    ).all<{ id: string }>();
    return { ids: results.map((row) => row.id) };
  },
  "categories.setPublished": async () => ({
    id: (await addCategory()).id,
    published: false,
  }),
  "categories.update": async () => {
    const row = await addCategory();
    return {
      expectedUpdatedAt: row.updatedAt.getTime(),
      id: row.id,
      name: `${row.name} hernoemd`,
    };
  },
};
