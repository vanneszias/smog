import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderSite } from "@/test/render";
import { LeaveGuard } from "./leave-guard";

/*
 * The leave guard over TanStack Router's blocker. (After "Stay" the memory
 * history settles slowly under happy-dom, so each answer is its own test;
 * the e2e covers both in a browser.)
 */

let blocking = true;

function shouldBlock(): boolean {
  return blocking;
}

function Page(): ReactNode {
  return (
    <div data-testid="page">
      <LeaveGuard shouldBlock={shouldBlock} />
    </div>
  );
}

async function blockedNavigation() {
  const site = await renderSite(Page);
  site.router.navigate({ to: "/elders" as never }).catch(() => undefined);
  const ask = await screen.findByRole("alertdialog", {
    name: "Leave without saving?",
  });
  return { ask, router: site.router };
}

describe("LeaveGuard", () => {
  test("asks before leaving; Stay keeps the page", async () => {
    blocking = true;
    const { ask, router } = await blockedNavigation();
    fireEvent.click(within(ask).getByRole("button", { name: "Stay" }));
    expect(router.state.location.pathname).toBe("/");
  });

  test("Leave goes on", async () => {
    blocking = true;
    const { ask, router } = await blockedNavigation();
    fireEvent.click(within(ask).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/elders"));
  });

  test("lets a clean page go without asking", async () => {
    blocking = false;
    const { router } = await renderSite(Page);
    await router.navigate({ to: "/elders" as never });
    expect(router.state.location.pathname).toBe("/elders");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
