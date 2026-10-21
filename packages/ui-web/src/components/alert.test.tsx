import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { classesOf, renderKit } from "../test/render";
import { Alert, AlertDescription, AlertTitle } from "./alert";

describe("Alert", () => {
  test("a danger alert is assertive, the others are a polite status", () => {
    renderKit(
      <>
        <Alert variant="danger">
          <AlertTitle>Could not save</AlertTitle>
          <AlertDescription>Try again.</AlertDescription>
        </Alert>
        <Alert data-testid="info">Heads up</Alert>
      </>
    );
    const danger = screen.getByRole("alert");
    expect(danger.textContent).toContain("Could not save");
    // Strong text on its subtle tint: the documented contrast pair.
    expect(classesOf(danger)).toContain("text-danger-strong");
    expect(classesOf(danger)).toContain("bg-danger-subtle");
    expect(screen.getByTestId("info").getAttribute("role")).toBe("status");
  });

  test("role can be overridden and className wins", () => {
    renderKit(
      <Alert className="px-2" role="note" variant="success">
        Saved
      </Alert>
    );
    const alert = screen.getByRole("note");
    expect(classesOf(alert)).toContain("px-2");
    expect(classesOf(alert)).not.toContain("px-4");
  });
});
