/**
 * `@smog/render/remotion`: the Remotion entry point, only for
 * `@remotion/bundler` (the image's bundle; phase 7 ruling 1).
 */
import { registerRoot } from "remotion";
import { Root } from "./root";

registerRoot(Root);
