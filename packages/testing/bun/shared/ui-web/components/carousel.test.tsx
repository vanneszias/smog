import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "../../../../../ui-web/src/components/carousel";
import { renderKit } from "../../../../support/ui-web/render";

describe("Carousel", () => {
  test("a labelled carousel of slides with named previous and next buttons", () => {
    renderKit(
      <Carousel aria-label="Featured gestures">
        <CarouselContent>
          <CarouselItem>One</CarouselItem>
          <CarouselItem>Two</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    );
    const region = screen.getByRole("region", { name: "Featured gestures" });
    expect(region.getAttribute("aria-roledescription")).toBe("Carousel");
    const slides = screen.getAllByRole("group");
    expect(slides).toHaveLength(2);
    expect(slides[0]?.getAttribute("aria-roledescription")).toBe("Slide");
    expect(
      screen.getByRole("button", { name: "Previous slide" })
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeDefined();
  });

  test("copy follows the locale", () => {
    renderKit(
      <Carousel aria-label="Uitgelicht">
        <CarouselContent>
          <CarouselItem>Een</CarouselItem>
        </CarouselContent>
        <CarouselNext />
      </Carousel>,
      "nl"
    );
    expect(screen.getByRole("button", { name: "Volgende dia" })).toBeDefined();
  });
});
