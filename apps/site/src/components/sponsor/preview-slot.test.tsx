import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { renderSite } from "@/test/render";
import { SponsorPreviewSlot } from "./preview-slot";

const BLOB_URL = /^blob:/;

afterEach(cleanup);

const card = (): Element | null =>
  document.querySelector('[data-slot="sponsor-end-card"]');

describe("SponsorPreviewSlot (the wizard preview is the end card)", () => {
  test("shows the gesture's poster with the end card: the message, the name as typed, the logo", async () => {
    await renderSite(() => (
      <div data-testid="page">
        <SponsorPreviewSlot
          displayName="Bakkerij JAN nv"
          logo={new File([new Uint8Array([1])], "l.png", { type: "image/png" })}
          name="Broer"
          playbackId="pb-1"
        />
      </div>
    ));
    const frame = screen.getByRole("img", { name: "Preview for Broer" });
    expect(frame.querySelector("img")?.getAttribute("src")).toContain(
      "image.mux.com/pb-1/thumbnail.webp"
    );
    expect(card()?.textContent).toBe("Made possible byBakkerij JAN nv");
    await waitFor(() =>
      expect(card()?.querySelector("img")?.getAttribute("src") ?? "").toMatch(
        BLOB_URL
      )
    );
    // The card is decoration inside a named picture.
    expect(card()?.getAttribute("aria-hidden")).toBe("true");
  });

  test("shows the card without a logo image", async () => {
    await renderSite(() => (
      <div data-testid="page">
        <SponsorPreviewSlot
          displayName="  Jan  "
          logo={null}
          name="Broer"
          playbackId="pb-1"
        />
      </div>
    ));
    expect(card()?.textContent).toBe("Made possible byJan");
    expect(card()?.querySelector("img")).toBeNull();
  });

  test("shows no card while the name is empty", async () => {
    await renderSite(() => (
      <div data-testid="page">
        <SponsorPreviewSlot
          displayName="   "
          logo={null}
          name="Broer"
          playbackId="pb-1"
        />
      </div>
    ));
    expect(
      screen.getByRole("img", { name: "Preview for Broer" })
    ).toBeDefined();
    expect(card()).toBeNull();
  });
});
