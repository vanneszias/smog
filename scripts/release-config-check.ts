const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) {
    throw new Error(`[releaseConfig] ${message}`);
  }
};

const workflowPath = ".github/workflows/ci.yml";
const workflowContents = await Bun.file(workflowPath).text();
assert(Bun.YAML.parse(workflowContents), `${workflowPath} is invalid`);
for (const required of [
  "pull_request:",
  "branches: [master]",
  'tags: ["**"]',
  "permissions:\n  contents: read",
  "bun-version-file: package.json",
  "bun install --frozen-lockfile",
  "bun run release:check",
  // `release:check:ci` filters the site suite out; this job is where it runs.
  "bun -F site test",
]) {
  assert(
    workflowContents.includes(required),
    `${workflowPath} must contain ${required}`
  );
}

console.log("[releaseConfig] The CI workflow is valid");
