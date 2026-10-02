import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { appRouter } from "@smog/api";
import { type RpcContext, rpcHandlerOptions } from "@smog/rpc";
import { renderReferenceHtml } from "./openapi-reference";

/**
 * The OpenAPI transport with the spec (`/spec.json`) and the Scalar reference
 * UI (`/`) under `/api/openapi`. Loaded lazily by `handleOpenApi`, only
 * where `apiDocsEnabled`. The UI is our page (`openapi-reference.ts`): the
 * plugin's default inlines a script and loads an unpinned bundle, which
 * the CSP blocks.
 */
export const openApiHandler = new OpenAPIHandler<RpcContext>(appRouter, {
  ...rpcHandlerOptions,
  plugins: [
    new OpenAPIReferencePlugin<RpcContext>({
      docsTitle: "SMOG API",
      renderDocsHtml: (_specUrl, title) => renderReferenceHtml(title),
      schemaConverters: [new ZodToJsonSchemaConverter()],
      specGenerateOptions: { info: { title: "SMOG API", version: "1.0.0" } },
    }),
  ],
});
