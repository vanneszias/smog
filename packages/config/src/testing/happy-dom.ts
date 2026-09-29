/**
 * `bun test --preload @smog/config/testing/happy-dom`: a DOM (happy-dom) for
 * the feature hook tests, which render with Testing Library. Pure tests do
 * not notice it. Tests only; never imported by runtime code.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
