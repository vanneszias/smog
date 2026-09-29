import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { oc } from "@orpc/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { RpcProvider, useRpcClient, useRpcQuery } from "../src/react";

// An "app" contract with two slices; the hooks below only know one of them.
const gesturesContract = {
  bySlug: oc.input(z.object({ slug: z.string() })).output(z.string()),
};
const appContract = {
  favorites: { ids: oc.output(z.array(z.string())) },
  gestures: gesturesContract,
};

interface GesturesSlice {
  gestures: typeof gesturesContract;
}

function makeApp() {
  const client: ContractRouterClient<typeof appContract> = createORPCClient(
    new RPCLink({ url: "http://localhost:5173/api/rpc" })
  );
  return { client, queryUtils: createTanstackQueryUtils(client) };
}

function GestureKey() {
  const query = useRpcQuery<GesturesSlice>();
  const client = useRpcClient<GesturesSlice>();
  const { queryKey } = query.gestures.bySlug.queryOptions({
    input: { slug: "hond" },
  });
  // The per-call client context is typed on slice utils too.
  const { mutationKey } = query.gestures.bySlug.mutationOptions({
    context: { turnstileToken: "widget-token" },
  });
  return (
    <output>
      {JSON.stringify(queryKey)} {JSON.stringify(mutationKey)}{" "}
      {typeof client.gestures.bySlug}
    </output>
  );
}

describe("RpcProvider", () => {
  it("gives feature hooks typed utils for their contract slice", () => {
    const html = renderToString(
      <RpcProvider {...makeApp()}>
        <GestureKey />
      </RpcProvider>
    );

    expect(html).toContain("gestures");
    expect(html).toContain("bySlug");
    expect(html).toContain("hond");
    expect(html).toContain("function");
  });

  it("throws a clear error outside the provider", () => {
    expect(() => renderToString(<GestureKey />)).toThrow(
      "[rpc] useRpcQuery must be used inside <RpcProvider>"
    );
  });
});
