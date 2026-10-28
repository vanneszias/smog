import { join } from "node:path";
import { TEST_ROOT } from "./suites";

let failed = false;
for (const file of new Bun.Glob("config/types/*.json").scanSync({
  cwd: TEST_ROOT,
})) {
  console.log(`[testing:types] ${file}`);
  // biome-ignore lint/performance/noAwaitInLoops: separate globals for each runner and Workers binding set.
  const code = await Bun.spawn(
    ["bunx", "--no-install", "tsc", "--project", join(TEST_ROOT, file)],
    { stderr: "inherit", stdout: "inherit" }
  ).exited;
  if (code !== 0) {
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
