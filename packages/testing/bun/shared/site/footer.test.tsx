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

for (const [locale, credit, about] of [
  ["nl", "Gemaakt door zias.be", "SMOG staat voor Spreken Met Ondersteuning"],
  ["en", "Made by zias.be", "SMOG stands for Spreken Met Ondersteuning"],
  ["fr", "Réalisé par zias.be", "SMOG signifie Spreken Met Ondersteuning"],
] as const) {
  test(`footer says what SMOG stands for and credits the author in plain text in ${locale}`, async () => {
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      routeTree: createRootRoute({ component: Footer }),
    });
    await router.load();
    renderKit(<RouterProvider router={router} />, locale);
    const link = await screen.findByRole("link", { name: credit });
    expect(link.getAttribute("href")).toBe("https://zias.be");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    // A plain credit line: no pill, no heart icon.
    expect(link.querySelectorAll("svg").length).toBe(0);
    expect(screen.getByText(about, { exact: false })).toBeTruthy();
  });
}
