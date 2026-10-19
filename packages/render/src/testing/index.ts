/** `@smog/render/testing`: the fake renderer, for tests only (phase 7 ruling 1). */
// biome-ignore lint/performance/noBarrelFile: the package's `./testing` entry.
export {
  createFakeRenderer,
  FAKE_RENDER_RESULT,
  type FakeRenderer,
  type FakeRendererOptions,
} from "./fake-renderer";
