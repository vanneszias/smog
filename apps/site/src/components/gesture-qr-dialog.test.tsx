import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderSite } from "@/test/render";
import {
  GestureQrDialog,
  gesturePageUrl,
  qrFileName,
} from "./gesture-qr-dialog";

function noop(): void {
  // The dialog stays open in this test.
}

/*
 * The QR dialog the public gesture page and the admin share (L-14): the
 * file name, the page URL it encodes, and what it shows.
 */
describe("GestureQrDialog", () => {
  test("names the PNG smog-<slug>-qr.png", () => {
    expect(qrFileName("hond")).toBe("smog-hond-qr.png");
    expect(qrFileName("Goede Morgen!")).toBe("smog-goede-morgen-qr.png");
    expect(qrFileName("één")).toBe("smog-een-qr.png");
  });

  test("encodes the public page of the slug", () => {
    expect(gesturePageUrl("https://smog.test", "goede-morgen")).toBe(
      "https://smog.test/gestures/goede-morgen"
    );
  });

  test("shows the code, the URL and the download for the gesture", async () => {
    await renderSite(
      (): ReactNode => (
        <div data-testid="page">
          <GestureQrDialog
            gesture={{ name: "Hond", slug: "hond" }}
            onOpenChange={noop}
            open
          />
        </div>
      )
    );
    expect(
      await screen.findByRole("dialog", { name: "QR code for Hond" })
    ).toBeDefined();
    expect(screen.getByText("https://smog.test/gestures/hond")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Download QR code" })
    ).toBeDefined();
  });
});
