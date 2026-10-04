import {
  type RendererPort,
  type RenderRequest,
  type RenderResult,
  renderRequestSchema,
} from "../contract";

/** What a fake render answers unless told otherwise: a 5 s 1080 × 1920 clip. */
export const FAKE_RENDER_RESULT: RenderResult = {
  bytes: 1_048_576,
  frames: 150,
  height: 1920,
  ms: 1,
  ok: true,
  width: 1080,
};

export interface FakeRendererOptions {
  /** Waits this long before answering (or throwing). */
  delayMs?: number;
  /** Thrown instead of answering, as a network fault or a timeout would. */
  error?: Error;
  /** The answer, or a function of the request; `FAKE_RENDER_RESULT` by default. */
  result?: RenderResult | ((request: RenderRequest) => RenderResult);
}

export type FakeRenderer = RendererPort & {
  /** Every request received, in order (invalid ones too). */
  readonly requests: RenderRequest[];
};

/**
 * A `RendererPort` for tests (phase 7 ruling 1): it records each request,
 * answers `invalidInput` for one the real server's schema refuses, and
 * otherwise answers or throws as configured. It never starts Chrome.
 */
export function createFakeRenderer(
  options: FakeRendererOptions = {}
): FakeRenderer {
  const requests: RenderRequest[] = [];
  return {
    async render(request: RenderRequest): Promise<RenderResult> {
      requests.push(request);
      if (options.delayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
      if (options.error) {
        throw options.error;
      }
      const parsed = renderRequestSchema.safeParse(request);
      if (!parsed.success) {
        return {
          code: "invalidInput",
          message: parsed.error.issues
            .map((issue) => issue.path.join("."))
            .join(", "),
          ok: false,
        };
      }
      const { result = FAKE_RENDER_RESULT } = options;
      return typeof result === "function" ? result(parsed.data) : result;
    },
    requests,
  };
}
