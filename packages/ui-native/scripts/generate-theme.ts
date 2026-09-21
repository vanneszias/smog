import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderTailwindConfig } from "../src/theme";

const target = fileURLToPath(new URL("../tailwind.config.js", import.meta.url));

writeFileSync(target, renderTailwindConfig(), "utf8");
process.stdout.write(`wrote ${target}\n`);
