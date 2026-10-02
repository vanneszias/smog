import { chromium, type FullConfig } from "@playwright/test";

/**
 * The pages whose first visit compiles most of the app: the shell, the
 * catalogue, a gesture, sign-in and the account page (guest).
 */
const WARM_UP_PATHS = [
  "/",
  "/gestures",
  "/gestures/hond",
  "/sign-in",
  "/account",
];

/**
 * Warms the Vite dev server once it is up (`webServer` starts first). A
 * cold dev server compiles every route on its first request and, when the
 * browser first asks for the client modules, optimises their dependencies
 * and reloads the page. Both used to land inside the first tests. A real
 * browser is used, since the dependency optimisation only follows the
 * client's module requests. A failure here is logged, not fatal: the tests
 * then report what is wrong.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const use = config.projects[0]?.use ?? {};
  const browser = await chromium.launch(use.launchOptions);
  try {
    const page = await browser.newPage({ baseURL: use.baseURL });
    for (const path of WARM_UP_PATHS) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one page after the other, as a cold server compiles them.
        await page.goto(path, { timeout: 120_000, waitUntil: "networkidle" });
      } catch (error) {
        console.warn(`[e2e] Failed to warm up ${path}:`, error);
      }
    }
  } finally {
    await browser.close();
  }
}
