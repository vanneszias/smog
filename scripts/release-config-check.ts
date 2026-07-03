interface ExpoConfig {
  expo: {
    android: { package: string };
    ios: { appleTeamId: string; bundleIdentifier: string };
  };
}

interface AppleAssociation {
  applinks: {
    details: Array<{ appID: string }>;
  };
}

type AndroidAssociation = Array<{
  target: {
    namespace: string;
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}>;

interface WebManifest {
  icons: Array<{ src: string }>;
}

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await Bun.file(path).text()) as T;

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) {
    throw new Error(`[releaseConfig] ${message}`);
  }
};

const appConfig = await readJson<ExpoConfig>("apps/native/app.json");
const appleAssociation = await readJson<AppleAssociation>(
  "apps/web/public/.well-known/apple-app-site-association"
);
const androidAssociation = await readJson<AndroidAssociation>(
  "apps/web/public/.well-known/assetlinks.json"
);
const webManifest = await readJson<WebManifest>(
  "apps/web/public/manifest.webmanifest"
);
const packageJson = await readJson<{ packageManager: string }>("package.json");

const expectedAppleAppId = `${appConfig.expo.ios.appleTeamId}.${appConfig.expo.ios.bundleIdentifier}`;
assert(
  appleAssociation.applinks.details.some(
    ({ appID }) => appID === expectedAppleAppId
  ),
  `Apple association must contain ${expectedAppleAppId}`
);

const androidTarget = androidAssociation.find(
  ({ target }) => target.namespace === "android_app"
)?.target;
assert(androidTarget, "Android association target is missing");
assert(
  androidTarget.package_name === appConfig.expo.android.package,
  `Android association package must be ${appConfig.expo.android.package}`
);
assert(
  androidTarget.sha256_cert_fingerprints.length > 0,
  "Android association must contain a Play app-signing fingerprint"
);
const sha256Fingerprint = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/u;
for (const fingerprint of androidTarget.sha256_cert_fingerprints) {
  assert(
    sha256Fingerprint.test(fingerprint),
    `Invalid Android SHA-256 fingerprint: ${fingerprint}`
  );
}

assert(webManifest.icons.length > 0, "Web manifest must contain icons");
for (const { src } of webManifest.icons) {
  const iconPath = `apps/web/public/${src.replace(/^\//u, "")}`;
  assert(await Bun.file(iconPath).exists(), `Missing web manifest icon ${src}`);
}

const indexHtml = await Bun.file("apps/web/index.html").text();
assert(
  indexHtml.match(/rel="manifest"/gu)?.length === 1,
  "Web index must contain exactly one manifest link"
);
assert(
  indexHtml.includes('href="/manifest.webmanifest"'),
  "Web index must link to manifest.webmanifest"
);

for (const composePath of ["compose.yml", "maintenance/compose.yml"]) {
  const parsed = Bun.YAML.parse(await Bun.file(composePath).text());
  assert(parsed && typeof parsed === "object", `${composePath} is invalid`);
}

const compose = await Bun.file("compose.yml").text();
for (const service of ["redis-session", "remotion", "server", "web"]) {
  assert(
    new RegExp(`^  ${service}:`, "mu").test(compose),
    `compose.yml is missing the ${service} service`
  );
}
assert(
  (compose.match(/IMAGE_TAG:\?Set IMAGE_TAG/gu)?.length ?? 0) === 3,
  "All application images must require an immutable IMAGE_TAG"
);

const bunVersion = packageJson.packageManager.replace(/^bun@/u, "");
for (const dockerfile of [
  "apps/remotion/Dockerfile",
  "apps/server/Dockerfile",
  "apps/web/Dockerfile",
]) {
  const contents = await Bun.file(dockerfile).text();
  assert(
    contents.includes(`oven/bun:${bunVersion}`),
    `${dockerfile} must use Bun ${bunVersion}`
  );
}

console.log(
  "[releaseConfig] Compose, native identifiers, app links, manifests, icons, and runtime pins are valid"
);
