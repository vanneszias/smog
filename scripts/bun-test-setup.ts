// Preloaded by `bun test` (see bunfig.toml). The web tests expect a DOM
// (FileReader, File, window), which Vitest provides via jsdom.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
