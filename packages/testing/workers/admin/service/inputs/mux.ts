import { createDirectUpload, gestureUploadPassthrough } from "@smog/video";
import { testMux } from "../mux-fake";
import type { ProcedureInputs } from "./index";

/**
 * For each `admin.mux` procedure, a function from the fixtures to an
 * input the admin call succeeds with (against the Mux fake).
 */
export const MUX_INPUTS: ProcedureInputs = {
  "mux.assets": () => ({}),
  "mux.createUpload": () => undefined,
  "mux.status": () => undefined,
  "mux.uploadStatus": async () => {
    const upload = await createDirectUpload(testMux.mux, {
      corsOrigin: "http://localhost:5173",
      passthrough: gestureUploadPassthrough(),
      test: true,
    });
    return { uploadId: upload.id };
  },
};
