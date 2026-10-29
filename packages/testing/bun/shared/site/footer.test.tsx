import { expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { screen } from "@testing-library/react";
import { Footer } from "../../../../../apps/site/src/components/app-shell/footer";
import { renderKit } from "../../../support/ui-web/render";

for (const [locale, name, phrase] of [
  ["nl", "Gemaakt met liefde door zias.be", "Gemaakt met"],
  ["en", "Made with love by zias.be", "Made with"],
  ["fr", "Fait avec amour par zias.be", "Fait avec"],
] as const) {
  test(`footer credits the author with one localized link in ${locale}`, async () => {
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      routeTree: createRootRoute({ component: Footer }),
    });
    await router.load();
    renderKit(<RouterProvider router={router} />, locale);
    const credit = await screen.findByRole("link", { name });
    expect(credit.getAttribute("href")).toBe("https://zias.be");
    expect(credit.getAttribute("target")).toBe("_blank");
    expect(credit.getAttribute("rel")).toBe("noopener noreferrer");
    expect(credit.textContent).toContain(phrase);
    expect(credit.textContent).toContain("zias.be");
    expect(credit.textContent).not.toContain("<heart");
    expect(credit.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true"
    );
    expect(credit.querySelectorAll("svg").length).toBe(1);
  });
}
