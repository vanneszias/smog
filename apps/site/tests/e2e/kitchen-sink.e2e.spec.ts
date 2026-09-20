import { expect, type Page, test } from "@playwright/test";

/**
 * The three things Stage 2 deliberately did not fake under jsdom.
 *
 * Every other test in this stage runs in jsdom, which computes no layout,
 * upgrades no custom element and resolves no CSS variable. Each assertion
 * here needs at least one of those three, which is why it lives in a real
 * browser and not in the unit suite.
 */

const KITCHEN_SINK = "http://localhost:3003/kitchen-sink";

const LONG_NAME = "Aangenaam kennis met je te maken";

/** Mux's hosts, which a sandboxed or offline machine cannot reach. */
const MUX_HOSTS = [
  "https://stream.mux.com/**",
  "https://image.mux.com/**",
  "https://inferred.litix.io/**",
];

/**
 * Holds every Mux request open for ever.
 *
 * Without this the outcome of the player tests depends on whether the machine
 * running them can reach Mux: online it plays, offline it errors into the
 * wrapper's empty state and the element is gone before an assertion can see
 * it. Stalling makes "the element mounted and upgraded" the only thing under
 * test, identically on both kinds of machine.
 */
async function stallMux(page: Page): Promise<void> {
  for (const host of MUX_HOSTS) {
    await page.route(host, () => {
      /* never settled on purpose */
    });
  }
}

test.describe("kitchen sink", () => {
  test("renders every section", async ({ page }) => {
    await page.goto(KITCHEN_SINK);

    for (const id of [
      "tokens",
      "forms",
      "layout",
      "feedback",
      "overlays",
      "domain",
    ]) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
  });

  /*
   * Deferred question 1: real overflow.
   *
   * `GestureCard.test.tsx` can only assert that `truncate`, `min-w-0` and
   * `overflow-hidden` are on the right elements — jsdom reports every width
   * as 0, so a `scrollWidth` assertion there would pass whatever the
   * component did. This is the same fixture in a 180px column, measured.
   */
  test("clips a long gesture name instead of widening its card", async ({
    page,
  }) => {
    await page.goto(KITCHEN_SINK);

    const probe = page.getByTestId("overflow-probe");
    const card = page.getByTestId("overflow-card");
    const heading = card.locator("h3");

    await expect(heading).toHaveText(LONG_NAME);

    const probeBox = await probe.boundingBox();
    const cardBox = await card.boundingBox();

    expect(probeBox).not.toBeNull();
    expect(cardBox).not.toBeNull();

    // The card stays inside the column it was given, to the pixel.
    expect(cardBox?.width ?? 0).toBeLessThanOrEqual(probeBox?.width ?? 0);

    const metrics = await heading.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      overflowX: getComputedStyle(element).overflowX,
      textOverflow: getComputedStyle(element).textOverflow,
    }));

    // The text really is wider than the box, and the box really does clip it.
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
    expect(metrics.overflowX).toBe("hidden");
    expect(metrics.textOverflow).toBe("ellipsis");

    // Nothing escapes: the card is not scrollable sideways either.
    const cardMetrics = await card.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));

    expect(cardMetrics.scrollWidth).toBeLessThanOrEqual(
      cardMetrics.clientWidth
    );

    // And the page as a whole gained no horizontal scroll from it.
    const documentMetrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(documentMetrics.scrollWidth).toBeLessThanOrEqual(
      documentMetrics.clientWidth
    );
  });

  /*
   * Deferred question 2: `<mux-player>` outside jsdom.
   *
   * `VideoPlayer.test.tsx` runs against a `vi.mock`, because upgrading the
   * custom element under jsdom throws inside the reaction queue. This asserts
   * the upgrade and the layout, which is what that mock cannot show. Playback
   * itself is not asserted anywhere: it needs a route to Mux, and a test that
   * passes or fails on the network is not a test of this component.
   */
  test("upgrades the real <mux-player> custom element", async ({ page }) => {
    await stallMux(page);
    /*
     * `domcontentloaded`, not the default `load`: a stalled subresource of
     * the player keeps the load event from ever firing, and waiting for it
     * makes this test fail on a timeout that has nothing to do with the
     * element under test.
     */
    await page.goto(KITCHEN_SINK, { waitUntil: "domcontentloaded" });

    const player = page.getByTestId("video-with-id").locator("mux-player");

    await expect(player).toHaveCount(1);

    await page.waitForFunction(
      () => window.customElements.get("mux-player") !== undefined
    );

    // The id reaches the element on the client, and only on the client: the
    // next test shows the server-rendered markup carries none, so this has to
    // be retried rather than read once.
    await expect(player).toHaveAttribute("playback-id", /^[A-Za-z0-9]{10,}$/);

    const shape = await player.evaluate((element) => ({
      hasShadowRoot: element.shadowRoot !== null,
      height: element.getBoundingClientRect().height,
      width: element.getBoundingClientRect().width,
    }));

    expect(shape.hasShadowRoot).toBe(true);
    expect(shape.width).toBeGreaterThan(0);

    // The wrapper holds 16:9 in every state, so the page does not jump.
    expect(shape.height / shape.width).toBeCloseTo(9 / 16, 1);
  });

  /*
   * The half of the Mux answer that is a defect rather than a reassurance.
   *
   * `@mux/mux-player-react` server-renders the element with its own software
   * name and version but no `playback-id`, so the first paint is a player
   * pointing at nothing and the video cannot start until hydration. The Task
   * 7 agent saw the same thing on the `/lazy` entry point; this pins it for
   * the eager one too, so a change of behaviour in a future Mux release is
   * visible rather than silent.
   */
  test("server-renders <mux-player> without its playback id", async ({
    page,
  }) => {
    const response = await page.request.get(KITCHEN_SINK);
    const html = await response.text();

    expect(html).toContain("<mux-player");
    expect(html).not.toContain("playback-id=");
  });

  test("falls back to the error state when the stream cannot be fetched", async ({
    page,
  }) => {
    for (const host of MUX_HOSTS) {
      await page.route(host, (route) => route.abort());
    }

    await page.goto(KITCHEN_SINK);

    const box = page.getByTestId("video-with-id");

    await expect(box.getByText("Video niet beschikbaar")).toBeVisible();
    await expect(box.locator("mux-player")).toHaveCount(0);
  });

  test("shows the error state for a gesture with no playback id", async ({
    page,
  }) => {
    await stallMux(page);
    /*
     * `domcontentloaded`, not the default `load`: a stalled subresource of
     * the player keeps the load event from ever firing, and waiting for it
     * makes this test fail on a timeout that has nothing to do with the
     * element under test.
     */
    await page.goto(KITCHEN_SINK, { waitUntil: "domcontentloaded" });

    const box = page.getByTestId("video-without-id");

    await expect(box.locator("mux-player")).toHaveCount(0);
    await expect(box.getByText("Video niet beschikbaar")).toBeVisible();
  });

  /*
   * Light-theme surface hierarchy, as the browser resolves it.
   *
   * Stage 2 measured light `background` and `surface` 1.06:1 apart and
   * `surfaceRaised` identical to `background`, with nothing but a 1.32:1
   * border separating a card from the page. Stage 3 Task 1 moved `background`
   * to `neutral[100]` and both surfaces to white. `contrast.test.ts` holds the
   * ratio; this reads the compiled custom properties, so a theme regenerated
   * from stale tokens cannot pass it.
   */
  test("resolves distinct surface, border and foreground tokens in both themes", async ({
    page,
  }) => {
    await page.goto(KITCHEN_SINK);

    const read = () =>
      page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        const value = (name: string) => style.getPropertyValue(name).trim();

        return {
          background: value("--color-background"),
          surface: value("--color-surface"),
          surfaceRaised: value("--color-surface-raised"),
          borderSubtle: value("--color-border-subtle"),
          foreground: value("--color-foreground"),
        };
      });

    const light = await read();

    expect(light.background).not.toBe("");
    expect(light.background).not.toBe(light.surface);
    /*
     * `surface` and `surfaceRaised` are the same white in light mode on
     * purpose, since Stage 3 moved `background` down the neutral ramp instead
     * of pushing the surfaces grey. The step that has to exist is
     * card-versus-page, asserted on the line above and held at 1.12:1 by
     * `contrast.test.ts`; elevation between two stacked surfaces is carried by
     * shadow. Dark mode still uses three distinct fills, checked below.
     */
    expect(light.surfaceRaised).toBe(light.surface);

    await page.getByRole("button", { name: /thema/i }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    const dark = await read();

    expect(dark.background).not.toBe(light.background);
    expect(dark.foreground).not.toBe(light.foreground);
    expect(dark.background).not.toBe(dark.surface);
    expect(dark.surface).not.toBe(dark.surfaceRaised);
  });

  /*
   * The `--spacing` hazard, checked against the compiled stylesheet rather
   * than against class names. `packages/ui-web`'s guard reads sources; this
   * reads what the browser was actually served, so it covers this route's own
   * files, which that guard does not scan.
   *
   * Every declared step resolves through a `--spacing-*` token. A step the
   * theme does not declare falls through to Tailwind's own `--spacing`
   * multiplier as `calc(var(--spacing) * n)`, which is a size this design
   * system never chose — plausible enough that nobody looks.
   */
  test("emits no spacing utility that falls back off the token scale", async ({
    page,
  }) => {
    await page.goto(KITCHEN_SINK);

    const offenders = await page.evaluate(() => {
      const found: string[] = [];

      const walk = (list: CSSRule[]) => {
        for (const rule of list) {
          if ("cssRules" in rule) {
            walk(Array.from((rule as CSSGroupingRule).cssRules));
          }

          if (rule.cssText.includes("calc(var(--spacing)")) {
            found.push(rule.cssText.slice(0, 120));
          }
        }
      };

      for (const sheet of Array.from(document.styleSheets)) {
        try {
          walk(Array.from(sheet.cssRules));
        } catch {
          /* A cross-origin sheet exposes no rules; there are none here. */
        }
      }

      return found;
    });

    expect(offenders).toEqual([]);
  });

  /*
   * The sibling hazard to the one above, and the one that actually bit.
   *
   * Tailwind v4 resolves a t-shirt-named width from the `--spacing-*`
   * namespace before `--container-*`. While `@smog/styles` emitted its
   * `sm`/`md`/`lg` aliases as CSS variables, `max-w-lg` meant 24px and this
   * dialog rendered 50 pixels wide with all 471 unit tests green. Measured
   * here because no class-name check can see it.
   */
  test("resolves t-shirt widths from the container scale, not the spacing scale", async ({
    page,
  }) => {
    await page.goto(KITCHEN_SINK);

    const aliases = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);

      return ["xs", "sm", "md", "lg", "xl", "xxl"]
        .map((name) => [name, style.getPropertyValue(`--spacing-${name}`)])
        .filter(([, value]) => value !== "");
    });

    expect(aliases).toEqual([]);

    await page.getByRole("button", { name: "Gebaar bewerken" }).click();

    const dialog = page.getByRole("dialog", { name: "Gebaar bewerken" });

    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();

    // 32rem is what `max-w-lg` means; anything near 50px is the old bug.
    expect(box?.width ?? 0).toBeGreaterThan(400);
  });

  test("closes a dialog on Escape and returns focus to its trigger", async ({
    page,
  }) => {
    await page.goto(KITCHEN_SINK);

    const trigger = page.getByRole("button", { name: "Gebaar bewerken" });

    await trigger.click();
    await expect(
      page.getByRole("dialog", { name: "Gebaar bewerken" })
    ).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(
      page.getByRole("dialog", { name: "Gebaar bewerken" })
    ).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});
