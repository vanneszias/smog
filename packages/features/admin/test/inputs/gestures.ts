import { SAMPLE_PLAYBACK_ID } from "@smog/db/testing";
import { addGesture } from "../catalog-helpers";
import type { ProcedureInputs } from "./index";

/**
 * For each `admin.gestures` procedure, a function from the fixtures to an
 * input the admin call succeeds with (a mutation then proves it built its
 * audit entry).
 */
export const GESTURES_INPUTS: ProcedureInputs = {
  "gestures.bulkUpdate": async ({ category }) => ({
    ids: [(await addGesture({ categories: [category] })).id],
    published: false,
  }),
  "gestures.checkName": ({ gesture }) => ({ name: gesture.name }),
  "gestures.create": ({ category }) => ({
    categoryIds: [category.id],
    name: "Auth create",
    playbackId: SAMPLE_PLAYBACK_ID,
  }),
  "gestures.delete": async () => {
    const row = await addGesture({ name: "Auth delete", published: false });
    return { confirmName: row.name, id: row.id };
  },
  "gestures.get": ({ gesture }) => ({ id: gesture.id }),
  "gestures.list": () => ({}),
  "gestures.saveMany": async () => {
    const row = await addGesture();
    return {
      items: [
        {
          expectedUpdatedAt: row.updatedAt.getTime(),
          id: row.id,
          patch: { description: "Bewaard in de tabel" },
        },
      ],
    };
  },
  "gestures.setPublished": async () => ({
    id: (await addGesture()).id,
    published: false,
  }),
  "gestures.update": async () => {
    const row = await addGesture();
    return {
      expectedUpdatedAt: row.updatedAt.getTime(),
      id: row.id,
      name: "Auth update",
    };
  },
};
