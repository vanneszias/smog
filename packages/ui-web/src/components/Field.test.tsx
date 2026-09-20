import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Field } from "./Field";
import { Input } from "./Input";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

/**
 * Resolves what a control's `aria-describedby` actually points at.
 *
 * The whole failure mode this file exists for is an `aria-describedby` that
 * holds an id nothing answers to, or that answers to the wrong element. A test
 * comparing two strings passes on both. Following the ids into the document
 * and reading the text back does not.
 */
const describedBy = (control: Element): string[] =>
  (control.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? `<no #${id}>`);

describe("Field", () => {
  it("names its control through the label", () => {
    render(
      <Field label="Naam">
        <Input />
      </Field>
    );
    expect(screen.getByLabelText("Naam")).toBe(
      screen.getByRole("textbox") as HTMLElement
    );
  });

  /*
   * Generated ids are where label association breaks: the label gets one id
   * and the control another, and every visual check still looks right.
   */
  it("generates an id and binds the label to it when the caller gives none", () => {
    render(
      <Field label="Naam">
        <Input />
      </Field>
    );
    const input = screen.getByRole("textbox");
    expect(input.getAttribute("id")).toBeTruthy();
    expect(screen.getByLabelText("Naam")).toBe(input as HTMLElement);
  });

  it("keeps the caller's own id on the control and binds the label to it", () => {
    render(
      <Field label="Naam">
        <Input id="eigen-id" />
      </Field>
    );
    const input = screen.getByRole("textbox");
    expect(input.getAttribute("id")).toBe("eigen-id");
    expect(screen.getByLabelText("Naam")).toBe(input as HTMLElement);
  });

  it("binds the label to an explicit htmlFor", () => {
    render(
      <Field htmlFor="expliciet" label="Naam">
        <Input />
      </Field>
    );
    const input = screen.getByRole("textbox");
    expect(input.getAttribute("id")).toBe("expliciet");
    expect(screen.getByLabelText("Naam")).toBe(input as HTMLElement);
  });

  it("gives two fields on one page distinct controls", () => {
    render(
      <>
        <Field help="Zoals in je paspoort" label="Voornaam">
          <Input />
        </Field>
        <Field help="Zonder tussenvoegsel" label="Achternaam">
          <Input />
        </Field>
      </>
    );
    const inputs = screen.getAllByRole("textbox");
    const [first, second] = [
      inputs[0] as HTMLElement,
      inputs[1] as HTMLElement,
    ];
    expect(first.getAttribute("id")).not.toBe(second.getAttribute("id"));
    expect(screen.getByLabelText("Voornaam")).toBe(first as HTMLElement);
    expect(screen.getByLabelText("Achternaam")).toBe(second as HTMLElement);
    expect(describedBy(first)).toEqual(["Zoals in je paspoort"]);
    expect(describedBy(second)).toEqual(["Zonder tussenvoegsel"]);
  });

  it("renders help text and points the control at it", () => {
    render(
      <Field help="Minimaal acht tekens" label="Wachtwoord">
        <Input />
      </Field>
    );
    expect(describedBy(screen.getByRole("textbox"))).toEqual([
      "Minimaal acht tekens",
    ]);
  });

  it("describes nothing when there is neither help nor error", () => {
    render(
      <Field label="Naam">
        <Input />
      </Field>
    );
    expect(
      screen.getByRole("textbox").getAttribute("aria-describedby")
    ).toBeNull();
  });

  it("renders an error and points the control at it", () => {
    render(
      <Field error="Dit veld is verplicht" label="Naam">
        <Input />
      </Field>
    );
    expect(describedBy(screen.getByRole("textbox"))).toEqual([
      "Dit veld is verplicht",
    ]);
  });

  it("marks the control invalid while there is an error", () => {
    render(
      <Field error="Dit veld is verplicht" label="Naam">
        <Input />
      </Field>
    );
    expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBe(
      "true"
    );
  });

  it("leaves the control valid when there is no error", () => {
    render(
      <Field help="Zoals in je paspoort" label="Naam">
        <Input />
      </Field>
    );
    expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBeNull();
  });

  /*
   * Help and error together is the case that quietly loses one of them: a
   * single-id `aria-describedby` overwrites rather than appends, and the hint
   * a user needs disappears at exactly the moment they got it wrong.
   */
  it("reaches both the help text and the error when both are present", () => {
    render(
      <Field
        error="Dit veld is verplicht"
        help="Zoals in je paspoort"
        label="Naam"
      >
        <Input />
      </Field>
    );
    expect(describedBy(screen.getByRole("textbox"))).toEqual([
      "Zoals in je paspoort",
      "Dit veld is verplicht",
    ]);
  });

  it("renders help and error as two separate elements", () => {
    render(
      <Field
        error="Dit veld is verplicht"
        help="Zoals in je paspoort"
        label="Naam"
      >
        <Input />
      </Field>
    );
    expect(screen.getByText("Zoals in je paspoort")).toBeDefined();
    expect(screen.getByText("Dit veld is verplicht")).toBeDefined();
  });

  it("keeps a describedby the caller put on the control", () => {
    render(
      <>
        <span id="extern">Uitleg elders</span>
        <Field error="Dit veld is verplicht" label="Naam">
          <Input aria-describedby="extern" />
        </Field>
      </>
    );
    expect(describedBy(screen.getByRole("textbox"))).toEqual([
      "Uitleg elders",
      "Dit veld is verplicht",
    ]);
  });

  it("gives two errored fields distinct message ids", () => {
    render(
      <>
        <Field error="Vul je voornaam in" label="Voornaam">
          <Input />
        </Field>
        <Field error="Vul je achternaam in" label="Achternaam">
          <Input />
        </Field>
      </>
    );
    const inputs = screen.getAllByRole("textbox");
    const [first, second] = [
      inputs[0] as HTMLElement,
      inputs[1] as HTMLElement,
    ];
    expect(describedBy(first)).toEqual(["Vul je voornaam in"]);
    expect(describedBy(second)).toEqual(["Vul je achternaam in"]);
  });

  /*
   * Field sets `aria-invalid`; it does not know about Input's `invalid`
   * variant. Without Input deriving one from the other the error is announced
   * but the control still looks fine.
   */
  it("makes the wrapped control look invalid too", () => {
    render(
      <Field error="Dit veld is verplicht" label="Naam">
        <Input />
      </Field>
    );
    expect(classesOf(screen.getByRole("textbox"))).toContain("border-danger");
  });

  it("forwards a ref to its wrapper element", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Field label="Naam" ref={ref}>
        <Input />
      </Field>
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it("spreads arbitrary props onto the wrapper", () => {
    render(
      <Field data-testid="naam-veld" label="Naam">
        <Input />
      </Field>
    );
    expect(screen.getByTestId("naam-veld").tagName).toBe("DIV");
  });

  it("lets className override a base class on the wrapper", () => {
    render(
      <Field className="gap-6" data-testid="naam-veld" label="Naam">
        <Input />
      </Field>
    );
    const classes = classesOf(screen.getByTestId("naam-veld"));
    expect(classes).toContain("gap-6");
    expect(classes).not.toContain("gap-2");
  });
});
