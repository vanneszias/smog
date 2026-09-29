import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { appRouter } from "@smog/api";
import { type RpcContext, rpcHandlerOptions } from "@smog/rpc";

/**
 * The OpenAPI transport with the spec (`/spec.json`) and the Scalar reference
 * UI (`/`) under `/api/openapi`. Loaded lazily by `handleOpenApi`, only
 * where `apiDocsEnabled`.
 */
export const openApiHandler = new OpenAPIHandler<RpcContext>(appRouter, {
  ...rpcHandlerOptions,
  plugins: [
    new OpenAPIReferencePlugin<RpcContext>({
      schemaConverters: [new ZodToJsonSchemaConverter()],
      specGenerateOptions: { info: { title: "SMOG API", version: "1.0.0" } },
    }),
  ],
});
