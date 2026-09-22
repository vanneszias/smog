import { SPONSORSHIP_STATUS_LABELS, SPONSORSHIP_STATUSES } from "@smog/config";
import { tokens } from "@smog/styles";
import { render, screen } from "@testing-library/react-native";
import { resolvedColor } from "../test/resolvedColor";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("has a label for every status the config publishes", () => {
    expect(Object.keys(SPONSORSHIP_STATUS_LABELS).sort()).toEqual(
      [...SPONSORSHIP_STATUSES].sort()
    );
  });

  it("renders each status's label", () => {
    for (const status of SPONSORSHIP_STATUSES) {
      const { getByText, unmount } = render(<StatusBadge status={status} />);
      expect(getByText(SPONSORSHIP_STATUS_LABELS[status])).toBeOnTheScreen();
      unmount();
    }
  });

  /**
   * A status that quietly stopped being looked up in
   * `SPONSORSHIP_STATUS_LABELS` would still fall through to the raw-value
   * branch and render *something* — the raw string differs status to
   * status — so plain `Set` distinctness on the seven rendered labels cannot
   * tell "every status translated" from "one status silently untranslated".
   * Same fix `Button.test.tsx` and `Badge.test.tsx` use: compare each real
   * status's render against an explicit unrecognised control's render,
   * rather than trusting distinctness alone.
   */
  it("gives every status a label distinct from an unrecognised status's fallback", () => {
    const control = "an-unimplemented-status";
    const { getByTestId: getControlLabel, unmount: unmountControl } = render(
      <StatusBadge status={control} />
    );
    const controlLabel = getControlLabel("label").props.children;
    unmountControl();

    const labels = SPONSORSHIP_STATUSES.map((status) => {
      const { getByTestId, unmount } = render(<StatusBadge status={status} />);
      const label = getByTestId("label").props.children;
      unmount();
      return label;
    });

    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).not.toContain(controlLabel);
  });

  it("does not throw on a status it has never heard of", () => {
    expect(() => {
      render(<StatusBadge status="verzonnen_status" />).unmount();
    }).not.toThrow();
  });

  it("falls back to the raw value for an unknown status", () => {
    render(<StatusBadge status="verzonnen_status" />);
    expect(screen.getByText("verzonnen_status")).toBeOnTheScreen();
  });

  it("lets a caller override a label", () => {
    render(<StatusBadge labels={{ active: "Loopt" }} status="active" />);
    expect(screen.getByText("Loopt")).toBeOnTheScreen();
  });

  it("keeps the built-in labels a caller did not override", () => {
    render(<StatusBadge labels={{ expired: "Voorbij" }} status="active" />);
    expect(screen.getByText("Actief")).toBeOnTheScreen();
  });

  it("paints a live sponsorship as a success", () => {
    render(<StatusBadge status="active" testID="subject" />);
    expect(screen.getByTestId("subject")).toHaveStyle({
      backgroundColor: resolvedColor(tokens.semantic.light.success),
    });
  });

  it("paints a rejection as a danger", () => {
    render(<StatusBadge status="rejected" testID="subject" />);
    expect(screen.getByTestId("subject")).toHaveStyle({
      backgroundColor: resolvedColor(tokens.semantic.light.danger),
    });
  });

  /*
   * An expired sponsorship ran its course; it is not a failure, and
   * painting it red tells a sponsor something went wrong when nothing did.
   */
  it("paints an expiry as neutral rather than as a failure", () => {
    render(<StatusBadge status="expired" testID="subject" />);
    expect(screen.getByTestId("subject")).not.toHaveStyle({
      backgroundColor: resolvedColor(tokens.semantic.light.danger),
    });
  });

  it("spreads unknown props onto the badge", () => {
    render(<StatusBadge accessibilityHint="status" status="active" />);
    expect(screen.getByTestId("root")).toHaveProp(
      "accessibilityHint",
      "status"
    );
  });
});
