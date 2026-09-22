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

/**
 * The total byte size of an `expo export` output directory.
 *
 * `apps/mobile` has no Worker to deploy and so no bundle-size number CI
 * already watches the way it watches `apps/server`'s or `apps/web`'s image —
 * this is that number for a native app. Nothing enforces a budget against it
 * yet; printing it on every run is what makes a regression visible at all.
 */
const exportSize = (dir: string): number => {
  const proc = Bun.spawnSync(["du", "-sk", dir]);

  if (proc.exitCode !== 0) {
    throw new Error(`[nativeReleaseCheck] Could not measure ${dir}`);
  }

  const kilobytes = Number.parseInt(
    proc.stdout.toString().split("\t")[0] ?? "",
    10
  );

  if (Number.isNaN(kilobytes)) {
    throw new Error(
      `[nativeReleaseCheck] Could not parse du output for ${dir}`
    );
  }

  return kilobytes * 1024;
};

if (hasNpm()) {
  run(["bun", "x", "expo-doctor", "apps/native"]);
  run(["bun", "x", "expo-doctor", "apps/mobile"]);
} else {
  console.warn(
    "[nativeReleaseCheck] Skipping expo-doctor because npm is unavailable in this environment"
  );
}

run(["bun", "-F", "native", "export"]);
run(["bun", "-F", "mobile", "export"]);

const mobileExportBytes = exportSize("apps/mobile/dist");
console.log(
  `[nativeReleaseCheck] apps/mobile export size: ${mobileExportBytes.toLocaleString("en-US")} bytes (${(mobileExportBytes / (1024 * 1024)).toFixed(2)} MiB)`
);
