import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./Card";

/*
 * Split list, never a substring: `"border-border-subtle".includes(
 * "border-border")` is true, so the substring form of the border assertions
 * below passes on exactly the markup they exist to reject.
 */
const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

describe("Card", () => {
  it("renders its children", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Begroetingen</CardTitle>
          <CardDescription>Twaalf gebaren</CardDescription>
        </CardHeader>
        <CardContent>Inhoud</CardContent>
        <CardFooter>Voet</CardFooter>
      </Card>
    );

    expect(screen.getByText("Begroetingen")).toBeDefined();
    expect(screen.getByText("Twaalf gebaren")).toBeDefined();
    expect(screen.getByText("Inhoud")).toBeDefined();
    expect(screen.getByText("Voet")).toBeDefined();
  });

  /*
   * Border roles. A static card's edge is decoration — the raised surface and
   * the shadow already say where it is — so it is `border-subtle`. See the
   * three roles in packages/styles/src/tokens.ts.
   */
  it("edges a static card with the decorative border", () => {
    render(<Card data-testid="kaart" />);
    const classes = classesOf(screen.getByTestId("kaart"));
    expect(classes).toContain("border-border-subtle");
    expect(classes).not.toContain("border-border");
  });

  /*
   * An interactive card is a control: the whole rectangle is the target, and
   * its edge is the only thing saying so. A boundary that changes what a user
   * understands when it is removed is the functional `border`.
   */
  it("edges an interactive card with the functional border", () => {
    render(<Card data-testid="kaart" interactive />);
    const classes = classesOf(screen.getByTestId("kaart"));
    expect(classes).toContain("border-border");
    expect(classes).not.toContain("border-border-subtle");
  });

  it("gives an interactive card a focus ring it can show for its contents", () => {
    render(<Card data-testid="kaart" interactive />);
    const classes = classesOf(screen.getByTestId("kaart"));
    expect(classes).toContain("focus-within:ring-2");
    expect(classes).toContain("focus-within:ring-ring");
  });

  it("gives a static card no focus ring", () => {
    render(<Card data-testid="kaart" />);
    expect(classesOf(screen.getByTestId("kaart"))).not.toContain(
      "focus-within:ring-2"
    );
  });

  it("lets className override a base class", () => {
    render(<Card className="bg-red-500" data-testid="kaart" />);
    const classes = classesOf(screen.getByTestId("kaart"));
    expect(classes).toContain("bg-red-500");
    expect(classes).not.toContain("bg-surface-raised");
  });

  it("lets className override the interactive variant's own border", () => {
    render(
      <Card className="border-border-subtle" data-testid="kaart" interactive />
    );
    const classes = classesOf(screen.getByTestId("kaart"));
    expect(classes).toContain("border-border-subtle");
    expect(classes).not.toContain("border-border");
  });

  it("forwards a ref to the card element", () => {
    const ref = createRef<HTMLDivElement>();
    render(<Card ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it("spreads arbitrary props onto the element", () => {
    render(<Card aria-label="Categoriekaart" data-testid="kaart" />);
    expect(screen.getByTestId("kaart").getAttribute("aria-label")).toBe(
      "Categoriekaart"
    );
  });

  it("renders its title as a heading", () => {
    render(<CardTitle>Begroetingen</CardTitle>);
    expect(screen.getByRole("heading", { name: "Begroetingen" })).toBeDefined();
  });

  /*
   * A card's title is a heading, but which level depends on the page it sits
   * in — so the element is the caller's to choose while the styling stays
   * ours.
   */
  it("renders its title as the given element when asChild is set", () => {
    render(
      <CardTitle asChild>
        <h2>Begroetingen</h2>
      </CardTitle>
    );
    const heading = screen.getByRole("heading", {
      name: "Begroetingen",
      level: 2,
    });
    expect(classesOf(heading)).toContain("font-semibold");
  });

  it("lets className override a base class on every part", () => {
    render(
      <Card>
        <CardHeader className="p-4" data-testid="kop">
          <CardTitle className="text-sm">Titel</CardTitle>
          <CardDescription className="text-lg">Uitleg</CardDescription>
        </CardHeader>
        <CardContent className="p-4" data-testid="inhoud" />
        <CardFooter className="p-4" data-testid="voet" />
      </Card>
    );

    for (const id of ["kop", "inhoud", "voet"]) {
      const classes = classesOf(screen.getByTestId(id));
      expect(classes).toContain("p-4");
      expect(classes).not.toContain("p-6");
    }
    expect(classesOf(screen.getByText("Titel"))).toContain("text-sm");
    expect(classesOf(screen.getByText("Titel"))).not.toContain("text-lg");
    expect(classesOf(screen.getByText("Uitleg"))).toContain("text-lg");
    expect(classesOf(screen.getByText("Uitleg"))).not.toContain("text-sm");
  });

  it("forwards refs to the header, title, description, content and footer", () => {
    const header = createRef<HTMLDivElement>();
    const title = createRef<HTMLHeadingElement>();
    const description = createRef<HTMLParagraphElement>();
    const content = createRef<HTMLDivElement>();
    const footer = createRef<HTMLDivElement>();

    render(
      <Card>
        <CardHeader ref={header}>
          <CardTitle ref={title}>Titel</CardTitle>
          <CardDescription ref={description}>Uitleg</CardDescription>
        </CardHeader>
        <CardContent ref={content} />
        <CardFooter ref={footer} />
      </Card>
    );

    expect(header.current).toBeInstanceOf(HTMLDivElement);
    expect(title.current).toBeInstanceOf(HTMLHeadingElement);
    expect(description.current).toBeInstanceOf(HTMLParagraphElement);
    expect(content.current).toBeInstanceOf(HTMLDivElement);
    expect(footer.current).toBeInstanceOf(HTMLDivElement);
  });

  it("spreads arbitrary props onto every part", () => {
    render(
      <Card>
        <CardHeader data-testid="kop" lang="nl">
          <CardTitle data-testid="titel" lang="nl">
            Titel
          </CardTitle>
          <CardDescription data-testid="uitleg" lang="nl">
            Uitleg
          </CardDescription>
        </CardHeader>
        <CardContent data-testid="inhoud" lang="nl" />
        <CardFooter data-testid="voet" lang="nl" />
      </Card>
    );

    for (const id of ["kop", "titel", "uitleg", "inhoud", "voet"]) {
      expect(screen.getByTestId(id).getAttribute("lang")).toBe("nl");
    }
  });
});
