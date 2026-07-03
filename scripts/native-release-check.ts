const run = (cmd: string[], options?: { env?: Record<string, string> }) => {
  const proc = Bun.spawnSync(cmd, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...options?.env,
    },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  if (proc.exitCode !== 0) {
    throw new Error(`[nativeReleaseCheck] Command failed: ${cmd.join(" ")}`);
  }
};

const hasNpm = (): boolean => {
  const proc = Bun.spawnSync(["which", "npm"], {
    cwd: process.cwd(),
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });

  return proc.exitCode === 0;
};

if (hasNpm()) {
  run(["bun", "x", "expo-doctor", "apps/native"]);
} else {
  console.warn(
    "[nativeReleaseCheck] Skipping expo-doctor because npm is unavailable in this environment"
  );
}

run(["bun", "-F", "native", "export"]);
