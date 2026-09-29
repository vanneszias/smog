/**
 * `bun test --preload` entry: a DOM (happy-dom) for the hook tests, which
 * render with Testing Library. Pure tests do not notice it.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
