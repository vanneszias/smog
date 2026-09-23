import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderThemeCss } from "../src/styles/theme";

const target = fileURLToPath(
  new URL("../src/styles/theme.css", import.meta.url)
);

writeFileSync(target, renderThemeCss(), "utf8");
process.stdout.write(`wrote ${target}\n`);
