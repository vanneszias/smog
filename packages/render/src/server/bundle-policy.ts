/**
 * Whether the render server builds its Remotion bundle at start (phase 7
 * task 9). The image is built with its bundle (ruling 17) and without
 * `@remotion/bundler`, so it uses that bundle, and builds one only when it
 * is missing. In dev with the bundler installed (`bun -F @smog/render
 * serve`, the local render loop, a local `test:render`) it rebuilds on
 * every start: a kept `.render-bundle/` would otherwise render the
 * composition as it was when the bundle was first made, silently (about
 * 15 s per start). The CI render lane runs the image with
 * `RENDER_ENVIRONMENT=dev` (for `RENDER_ALLOW_HTTP`); it cannot bundle
 * there, so it uses the image's.
 */
export function bundleAction(input: {
  /** `@remotion/bundler` resolves (a checkout, not the image). */
  canBundle: boolean;
  environment: "dev" | "staging" | "production";
  hasBundle: boolean;
}): "build" | "use" {
  if (!input.hasBundle) {
    return "build";
  }
  return input.environment === "dev" && input.canBundle ? "build" : "use";
}

/** Whether `@remotion/bundler` is installed here. */
export function bundlerInstalled(): boolean {
  try {
    import.meta.resolve("@remotion/bundler");
    return true;
  } catch {
    return false;
  }
}
