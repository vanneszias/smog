import { describe, expect, mock, test } from "bun:test";
import { LOCALES } from "@smog/i18n";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderKit } from "../test/render";
import {
  COURSE_MESSAGE_COUNT,
  CourseBanner,
  type CourseMessageIndex,
} from "./course-banner";

const COURSE_URL = "https://smog.vlaanderen/volg-een-cursus";
const INDICES = Array.from(
  { length: COURSE_MESSAGE_COUNT },
  (_, i) => (i + 1) as CourseMessageIndex
);

describe("CourseBanner", () => {
  test("renders the message with its phrase linked to the course", () => {
    renderKit(<CourseBanner courseUrl={COURSE_URL} messageIndex={2} />);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("Important notice");
    expect(banner.textContent).toContain(
      "If you want to take a course after watching these videos, click here."
    );
    const link = screen.getByRole("link", { name: "click here" });
    expect(link.getAttribute("href")).toBe(COURSE_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  test("the localized phrase is the link (nl)", () => {
    renderKit(<CourseBanner courseUrl={COURSE_URL} messageIndex={2} />, "nl");
    expect(screen.getByRole("link", { name: "klik dan hier" })).toBeDefined();
  });

  test("a message without a phrase has no link", () => {
    renderKit(<CourseBanner courseUrl={COURSE_URL} messageIndex={4} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(
      screen.getByText("The gestures are protected. Don't invent others.")
    ).toBeDefined();
  });

  test("the 7 messages link the same ones in every locale", () => {
    expect(COURSE_MESSAGE_COUNT).toBe(7);
    const linked = (locale: (typeof LOCALES)[number]): number[] =>
      INDICES.filter((index) => {
        const { unmount } = renderKit(
          <CourseBanner courseUrl={COURSE_URL} messageIndex={index} />,
          locale
        );
        const text = screen.getByRole("status").textContent ?? "";
        const hasLink = screen.queryByRole("link") !== null;
        expect(text).not.toContain("gesture.videoComplete");
        expect(text).not.toContain("<course>");
        unmount();
        return hasLink;
      });
    const nl = linked("nl");
    expect(nl).toEqual([1, 2, 3, 6]);
    for (const locale of LOCALES) {
      expect(linked(locale)).toEqual(nl);
    }
  });

  test("onDismiss adds a close button", async () => {
    const onDismiss = mock();
    renderKit(
      <CourseBanner
        courseUrl={COURSE_URL}
        messageIndex={1}
        onDismiss={onDismiss}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
