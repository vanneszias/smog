import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { type AdminUserDetail, USER_GUARD_REASONS } from "@smog/admin/schema";
import { createI18n, LOCALES } from "@smog/i18n";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderSite } from "@/test/render";
import { UserPanel, userActionError } from "./user-panel";
import { roleLabel, userListInput, validateUserSearch } from "./user-table";

const MEMBER: AdminUserDetail = {
  banExpires: null,
  banned: false,
  banReason: null,
  createdAt: Date.UTC(2026, 8, 1, 10, 0),
  email: "mia@smog.test",
  emailVerified: true,
  favorites: 3,
  id: "u-mia",
  lists: 1,
  methods: ["credential", "google"],
  name: "Mia Member",
  role: "user",
  sessions: 2,
  sponsorships: [],
};

const ADMIN_ID = "u-admin";

/** The text of the elements an element's `aria-describedby` names. */
function describedBy(element: Element): string {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

function noop(): void {
  // The panel stays open in these tests.
}

function panelPage(userId: string): () => ReactNode {
  return function Page(): ReactNode {
    return (
      <div data-testid="page">
        <UserPanel actorId={ADMIN_ID} onClose={noop} userId={userId} />
      </div>
    );
  };
}

describe("user labels", () => {
  test("every refusal and role has a label in every locale", () => {
    for (const locale of LOCALES) {
      const { t } = createI18n(locale);
      for (const reason of USER_GUARD_REASONS) {
        const message = userActionError(
          t,
          new ORPCError("INVALID_STATE", { data: { reason } })
        );
        expect(message, `${locale} ${reason}`).not.toContain("admin.users");
      }
      for (const role of ["user", "admin"] as const) {
        expect(roleLabel(t, role)).not.toContain("admin.users");
      }
    }
  });

  test("maps NOT_FOUND, VALIDATION and anything else", () => {
    const { t } = createI18n("en");
    expect(userActionError(t, new ORPCError("NOT_FOUND"))).toBe(
      "This account no longer exists."
    );
    expect(userActionError(t, new ORPCError("VALIDATION"))).toBe(
      "The email address does not match."
    );
    expect(userActionError(t, new Error("network"))).toBe(
      "Something went wrong. Please try again."
    );
  });
});

describe("user search", () => {
  test("keeps valid filters only, and sets every key", () => {
    expect(
      validateUserSearch({
        banned: "maybe",
        extra: "x",
        q: "100%",
        role: "admin",
        user: "u-1",
      })
    ).toEqual({
      banned: undefined,
      cursor: undefined,
      q: "100%",
      role: "admin",
      user: "u-1",
    });
    expect(validateUserSearch({ q: "   ", role: "root" })).toMatchObject({
      q: undefined,
      role: undefined,
    });
  });

  test("turns the URL into the list input", () => {
    expect(userListInput({ banned: "yes", q: " ada " })).toEqual({
      banned: true,
      cursor: undefined,
      q: "ada",
      role: undefined,
    });
    expect(userListInput({ banned: "no" }).banned).toBe(false);
    expect(userListInput({}).banned).toBeUndefined();
  });
});

describe("UserPanel", () => {
  test("shows the account and disables every action on the admin's own account", async () => {
    await renderSite(panelPage(ADMIN_ID), {
      api: {
        "admin/users/get": {
          ...MEMBER,
          email: "ada@smog.test",
          id: ADMIN_ID,
          name: "Ada Admin",
          role: "admin",
        },
      },
    });
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => {
      expect(dialog.textContent).toContain("ada@smog.test");
    });
    expect(dialog.textContent).toContain("This is your own account.");
    for (const name of ["Remove admin role", "Ban", "Delete account"]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      // The reason is tied to the button, for screen readers (M-6).
      expect(describedBy(button)).toContain("This is your own account.");
    }
  });

  test("lists the account's sponsorships, each linking to its detail", async () => {
    await renderSite(panelPage(MEMBER.id), {
      api: {
        "admin/users/get": {
          ...MEMBER,
          sponsorships: [
            {
              createdAt: Date.UTC(2026, 8, 2),
              displayName: "Bakkerij Mia",
              gesture: { id: "g-hond", name: "Hond", slug: "hond" },
              id: "sp-mia",
              status: "live",
            },
          ],
        },
      },
    });
    const section = await screen.findByRole("region", {
      name: "Sponsorships",
    });
    const link = section.querySelector("a");
    expect(link?.textContent).toBe("Hond");
    expect(link?.getAttribute("href")).toBe("/admin/sponsorships/sp-mia");
    expect(section.textContent).toContain("Bakkerij Mia");
    expect(section.textContent).toContain("Live");
  });

  test("an admin target can be demoted, not banned or deleted", async () => {
    await renderSite(panelPage("u-other"), {
      api: {
        "admin/users/get": { ...MEMBER, id: "u-other", role: "admin" },
      },
    });
    await screen.findByText(
      "Remove the admin role before you ban or delete this account."
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Remove admin role",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    const ban = screen.getByRole("button", {
      name: "Ban",
    }) as HTMLButtonElement;
    expect(ban.disabled).toBe(true);
    expect(describedBy(ban)).toContain("Remove the admin role before");
    const remove = screen.getByRole("button", {
      name: "Delete account",
    }) as HTMLButtonElement;
    expect(describedBy(remove)).toContain("Remove the admin role before");
  });

  test("a banned account cannot be made an admin, and says why", async () => {
    await renderSite(panelPage(MEMBER.id), {
      api: {
        "admin/users/get": { ...MEMBER, banned: true, banReason: "Spam" },
      },
    });
    const promote = (await screen.findByRole("button", {
      name: "Make admin",
    })) as HTMLButtonElement;
    expect(promote.disabled).toBe(true);
    expect(describedBy(promote)).toContain("Lift the ban before");
    expect(
      (screen.getByRole("button", { name: "Lift ban" }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  test("bans with a reason and a length, behind an AlertDialog", async () => {
    const site = await renderSite(panelPage(MEMBER.id), {
      api: {
        "admin/users/ban": {
          user: { ...MEMBER, banned: true, banReason: "Spam" },
        },
        "admin/users/get": MEMBER,
      },
    });
    await screen.findByText("Password, Google");
    fireEvent.click(screen.getByRole("button", { name: "Ban" }));
    const alert = await screen.findByRole("alertdialog");
    const confirm = Array.from(alert.querySelectorAll("button")).find(
      (button) => button.textContent === "Ban"
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(alert.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "Spam" },
    });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(site.calls.map((call) => call.path)).toContain("admin/users/ban");
    });
    expect(
      site.calls.find((call) => call.path === "admin/users/ban")?.input
    ).toEqual({ reason: "Spam", userId: MEMBER.id });
    await screen.findByText("Mia Member is banned.");
  });

  test("deletes only after the email is typed", async () => {
    const site = await renderSite(panelPage(MEMBER.id), {
      api: {
        "admin/users/delete": { id: MEMBER.id },
        "admin/users/get": MEMBER,
      },
    });
    await screen.findByText("Password, Google");
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    const alert = await screen.findByRole("alertdialog");
    const confirm = Array.from(alert.querySelectorAll("button")).find(
      (button) => button.textContent === "Delete account"
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    const input = alert.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "someone@smog.test" } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "MIA@smog.test" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(
        site.calls.find((call) => call.path === "admin/users/delete")?.input
      ).toEqual({ confirmEmail: "MIA@smog.test", userId: MEMBER.id });
    });
  });
});
