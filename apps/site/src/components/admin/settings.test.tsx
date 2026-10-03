import { describe, expect, mock, spyOn, test } from "bun:test";
import type { MaintenanceSetting } from "@smog/admin/schema";
import { EMAIL_TEMPLATE_IDS } from "@smog/email/samples";
import { createI18n, LOCALES } from "@smog/i18n";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  BypassRequestError,
  type IssuedBypass,
} from "@/lib/maintenance-bypass";
import { renderSite } from "@/test/render";
import { BypassCard } from "./bypass-card";
import {
  EmailPreview,
  type EmailPreviewSearch,
  emailPreviewCsp,
  emailTemplateLabel,
  sandboxedEmailDocument,
  validateEmailPreviewSearch,
} from "./email-preview";
import { MaintenanceCard } from "./maintenance-card";

const OFF: MaintenanceSetting = { bypassVersion: 4, enabled: false };
const ON: MaintenanceSetting = {
  bypassVersion: 4,
  enabled: true,
  message: "Nieuwe video's",
};

const PROPAGATION = /up to about 2 minutes/;
const MESSAGE_LABEL = /Message/;
const UNTIL_LABEL = /Expected end/;
const ACTIVE_UNTIL = /^Active until /;
const STALE_COOKIE = /bypass cookie is for an older window/;

function noop(): void {
  // Nothing to do in these tests.
}

const EXPIRES = "2026-10-02T23:00:00.000Z";

function issued(bypassVersion: number): IssuedBypass {
  return { bypassVersion, expiresAt: EXPIRES };
}

function bypassed(): Promise<IssuedBypass> {
  return Promise.resolve(issued(OFF.bypassVersion));
}

function page(ui: ReactNode): () => ReactNode {
  return function Page(): ReactNode {
    return <div data-testid="page">{ui}</div>;
  };
}

describe("MaintenanceCard", () => {
  test("enable asks for the bypass cookie first, then turns maintenance on", async () => {
    const order: string[] = [];
    const requestBypass = mock(() => {
      order.push("bypass");
      return Promise.resolve(issued(OFF.bypassVersion));
    });
    const site = await renderSite(
      page(<MaintenanceCard requestBypass={requestBypass} />),
      {
        api: {
          "admin/maintenance/get": OFF,
          "admin/maintenance/set": (input: unknown) => {
            order.push("set");
            return { ...OFF, ...(input as object) };
          },
        },
      }
    );
    await screen.findByText("Off");
    expect(screen.getByText(PROPAGATION)).toBeDefined();
    fireEvent.change(screen.getByLabelText(MESSAGE_LABEL), {
      target: { value: "  Update " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enable maintenance" }));
    await screen.findByText("Maintenance is on");
    expect(order).toEqual(["bypass", "set"]);
    expect(
      site.calls.find((call) => call.path === "admin/maintenance/set")?.input
    ).toEqual({ enabled: true, message: "Update" });
  });

  test("asks again when the cookie's version is not the one set wrote, and warns if it still differs", async () => {
    // A stale KV read: the cookie is signed for 3, `set` wrote 4.
    const requestBypass = mock(() => Promise.resolve(issued(3)));
    await renderSite(page(<MaintenanceCard requestBypass={requestBypass} />), {
      api: {
        "admin/maintenance/get": OFF,
        "admin/maintenance/set": { ...OFF, enabled: true },
      },
    });
    await screen.findByText("Off");
    fireEvent.click(screen.getByRole("button", { name: "Enable maintenance" }));
    await screen.findByText(STALE_COOKIE);
    expect(requestBypass).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Maintenance is on")).toBeNull();
  });

  test("a second cookie of the right version is a plain success", async () => {
    const versions = [3, 4];
    const requestBypass = mock(() =>
      Promise.resolve(issued(versions.shift() ?? 4))
    );
    await renderSite(page(<MaintenanceCard requestBypass={requestBypass} />), {
      api: {
        "admin/maintenance/get": OFF,
        "admin/maintenance/set": { ...OFF, enabled: true },
      },
    });
    await screen.findByText("Off");
    fireEvent.click(screen.getByRole("button", { name: "Enable maintenance" }));
    await screen.findByText("Maintenance is on");
    expect(requestBypass).toHaveBeenCalledTimes(2);
  });

  test("stays off when the bypass cookie is refused", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {
      // The card logs the refusal; asserted below.
    });
    const requestBypass = mock(() => Promise.reject(new Error("401")));
    const site = await renderSite(
      page(<MaintenanceCard requestBypass={requestBypass} />),
      { api: { "admin/maintenance/get": OFF } }
    );
    await screen.findByText("Off");
    fireEvent.click(screen.getByRole("button", { name: "Enable maintenance" }));
    await screen.findByText(
      "No bypass cookie for this browser, so maintenance stays off."
    );
    expect(
      site.calls.some((call) => call.path === "admin/maintenance/set")
    ).toBe(false);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  test("refuses an end in the past before asking anything", async () => {
    const requestBypass = mock(bypassed);
    await renderSite(page(<MaintenanceCard requestBypass={requestBypass} />), {
      api: { "admin/maintenance/get": OFF },
    });
    await screen.findByText("Off");
    fireEvent.change(screen.getByLabelText(UNTIL_LABEL), {
      target: { value: "2020-01-01T10:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enable maintenance" }));
    await screen.findByText("Pick a time in the future, at most 7 days ahead.");
    expect(requestBypass).not.toHaveBeenCalled();
  });

  test("disable explains that every bypass cookie is revoked, then turns it off", async () => {
    const onChanged = mock(() => undefined);
    const site = await renderSite(
      page(<MaintenanceCard onChanged={onChanged} requestBypass={bypassed} />),
      {
        api: {
          "admin/maintenance/get": ON,
          "admin/maintenance/set": { ...OFF, bypassVersion: 5 },
        },
      }
    );
    await screen.findByText("Nieuwe video's");
    fireEvent.click(
      screen.getByRole("button", { name: "Disable maintenance" })
    );
    const alert = await screen.findByRole("alertdialog");
    expect(alert.textContent).toContain("Every bypass cookie is revoked");
    const confirm = Array.from(alert.querySelectorAll("button")).find(
      (button) => button.textContent === "Disable maintenance"
    );
    fireEvent.click(confirm as HTMLButtonElement);
    await screen.findByText(
      "Maintenance is off. Every bypass cookie is revoked."
    );
    expect(
      site.calls.find((call) => call.path === "admin/maintenance/set")?.input
    ).toEqual({ enabled: false });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});

describe("BypassCard", () => {
  test("shows the expiry, or that it is not active, and asks for a cookie", async () => {
    const requestBypass = mock(bypassed);
    await renderSite(
      page(
        <>
          <BypassCard
            isError={false}
            onRetry={noop}
            requestBypass={requestBypass}
            status={{ active: false }}
          />
          <BypassCard
            isError={false}
            onRetry={noop}
            requestBypass={requestBypass}
            status={{ active: true, expiresAt: "2026-10-02T23:00:00.000Z" }}
          />
        </>
      )
    );
    expect(screen.getByText("Not active")).toBeDefined();
    expect(screen.getByText(ACTIVE_UNTIL)).toBeDefined();
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Bypass for this browser (12 h)",
      })[0] as HTMLButtonElement
    );
    await waitFor(() => expect(requestBypass).toHaveBeenCalled());
  });
});

test("BypassCard says when it was rate limited", async () => {
  const logged = spyOn(console, "error").mockImplementation(() => {
    // Logged by the card.
  });
  const requestBypass = mock(() => Promise.reject(new BypassRequestError(429)));
  await renderSite(
    page(
      <BypassCard
        isError={false}
        onRetry={noop}
        requestBypass={requestBypass}
        status={{ active: false }}
      />
    )
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Bypass for this browser (12 h)" })
  );
  await screen.findByText("Too many attempts. Try again in a minute.");
  logged.mockRestore();
});

describe("email previews", () => {
  test("every template has a label in every locale", () => {
    for (const locale of LOCALES) {
      const { t } = createI18n(locale);
      for (const id of EMAIL_TEMPLATE_IDS) {
        expect(emailTemplateLabel(t, id)).not.toContain("admin.emails");
      }
    }
  });

  test("the preview document carries its own strict CSP", () => {
    const html =
      '<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"></head><body>Hoi</body></html>';
    const document = sandboxedEmailDocument(html);
    const policy = emailPreviewCsp();
    expect(policy).toContain("default-src 'none'");
    expect(policy).not.toContain("script-src");
    expect(policy).toContain("img-src data:;");
    expect(document).toContain(
      `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`
    );
    // The header logo loads from this site's /brand/ folder, nothing else.
    expect(emailPreviewCsp("http://localhost:5173")).toContain(
      "img-src data: http://localhost:5173/brand/;"
    );
    expect(sandboxedEmailDocument(html, "http://localhost:5173")).toContain(
      emailPreviewCsp("http://localhost:5173")
    );
    expect(document).toContain("<body>Hoi</body>");
    // A click on a link would be a popup, which the sandbox blocks.
    expect(document).toContain('<base target="_blank">');
    // Without a head, the policy goes first.
    expect(sandboxedEmailDocument("<p>x</p>").startsWith("<meta")).toBe(true);
  });

  test("keeps valid search params only", () => {
    expect(
      validateEmailPreviewSearch({
        locale: "de",
        template: "auth/otp",
        width: "huge",
      })
    ).toEqual({ locale: undefined, template: "auth/otp", width: undefined });
    expect(validateEmailPreviewSearch({ template: "auth/nope" })).toEqual({
      locale: undefined,
      template: undefined,
      width: undefined,
    });
  });

  test("renders the template in a sandboxed iframe, and its plain text in a tab", async () => {
    const search: EmailPreviewSearch = { template: "auth/otp" };
    await renderSite(
      page(<EmailPreview onSearchChange={noop} search={search} />),
      {
        api: {
          "admin/emails/list": [
            {
              id: "auth/otp",
              subject: { en: "482913 is your code", fr: "f", nl: "n" },
            },
            {
              id: "auth/magic-link",
              subject: { en: "Your link", fr: "f", nl: "n" },
            },
          ],
          "admin/emails/preview": {
            html: "<html><head></head><body><script>alert(1)</script>OTP body</body></html>",
            subject: "482913 is je code",
            text: "Plain OTP <b>body</b>",
          },
        },
      }
    );
    const frame = (await screen.findByTitle(
      "Preview: Sign-in code"
    )) as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toContain("Content-Security-Policy");
    expect(frame.getAttribute("srcdoc")).toContain("OTP body");
    expect(screen.getByText("482913 is je code")).toBeDefined();
    expect(frame.style.width).toBe("780px");
    // The frame scrolls sideways on a phone: its scroller takes the focus
    // (axe `scrollable-region-focusable`), named after the preview.
    const scroller = screen.getByRole("region", {
      name: "Preview: Sign-in code",
    });
    expect(scroller.getAttribute("tabindex")).toBe("0");
    expect(scroller.contains(frame)).toBe(true);
    // The text tab escapes it (React text, not HTML).
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Plain text" }));
    expect(await screen.findByText("Plain OTP <b>body</b>")).toBeDefined();
  });
});
