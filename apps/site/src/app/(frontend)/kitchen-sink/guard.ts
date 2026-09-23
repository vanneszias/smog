/**
 * Whether the kitchen sink is allowed to render.
 *
 * The route is a development tool: it imports every component in the library
 * and renders each of them in every state, which is exactly what a reviewer
 * wants and exactly what nobody visiting the public site should find. Leaving
 * it unlinked is not enough — an unlinked page is still a crawlable page — so
 * the page itself refuses in production.
 *
 * `NODE_ENV` is read as an argument rather than off `process.env` inside, so
 * the decision is a pure function a test can drive through all three values
 * Next ever sets it to.
 */
export function isKitchenSinkAvailable(nodeEnv: string | undefined): boolean {
  return nodeEnv !== "production";
}
