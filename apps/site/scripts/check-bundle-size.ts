const MIB = 1024 * 1024;

type BundleSizeLevel = "ok" | "warn" | "exceeded";

interface BundleSizeResult {
  ok: boolean;
  level: BundleSizeLevel;
  message: string;
}

export function checkBundleSize(
  bytes: number,
  limitBytes: number,
  warnBytes: number
): BundleSizeResult {
  const used = (bytes / MIB).toFixed(2);
  const limit = (limitBytes / MIB).toFixed(2);

  if (bytes >= limitBytes) {
    return {
      ok: false,
      level: "exceeded",
      message: `Worker bundle is ${used} MiB gzipped, which exceeds the ${limit} MiB limit.`,
    };
  }

  const headroom = Math.round(((limitBytes - bytes) / limitBytes) * 100);

  if (bytes >= warnBytes) {
    return {
      ok: true,
      level: "warn",
      message: `Worker bundle is ${used} MiB gzipped of ${limit} MiB. Only ${headroom}% headroom remaining.`,
    };
  }

  return {
    ok: true,
    level: "ok",
    message: `Worker bundle is ${used} MiB gzipped of ${limit} MiB. ${headroom}% headroom remaining.`,
  };
}
