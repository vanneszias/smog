import { act, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { Avatar, AvatarFallback, AvatarImage, initialsFrom } from "./Avatar";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

/*
 * Radix decides whether an avatar image loaded by constructing
 * `new window.Image()` and listening for its `load` / `error`. jsdom builds
 * the object but never fetches anything, so neither event ever fires and the
 * failure path — the whole behavioural contract here — would be untestable.
 *
 * This stub records every image Radix creates and lets a test fire either
 * event on it. Installed at MODULE SCOPE, not in a `beforeAll`: a throw in
 * `beforeAll` fails the file without failing any named test, and Vitest then
 * reports the rest as "skipped", which reads like success.
 */
const createdImages: StubImage[] = [];

class StubImage extends EventTarget {
  complete = false;
  naturalWidth = 0;
  src = "";
  referrerPolicy = "";
  crossOrigin: string | null = null;

  constructor() {
    super();
    createdImages.push(this);
  }

  load() {
    this.complete = true;
    this.naturalWidth = 1;
    this.dispatchEvent(new Event("load"));
  }

  fail() {
    this.dispatchEvent(new Event("error"));
  }
}

Object.assign(globalThis, { Image: StubImage });

beforeEach(() => {
  createdImages.length = 0;
});

const lastImage = (): StubImage => {
  const image = createdImages.at(-1);
  if (!image) {
    throw new Error("Radix never constructed an Image");
  }
  return image;
};

function renderAvatar(
  props: Partial<{
    name: string;
    rootClassName: string;
    imageClassName: string;
    fallbackClassName: string;
  }> = {}
) {
  return render(
    <Avatar className={props.rootClassName} data-testid="avatar">
      <AvatarImage
        alt="Jan de Vries"
        className={props.imageClassName}
        src="https://example.invalid/jan.png"
      />
      <AvatarFallback
        className={props.fallbackClassName}
        name={props.name ?? "Jan de Vries"}
      />
    </Avatar>
  );
}

describe("initialsFrom", () => {
  it("takes the first letter of the first and last words", () => {
    expect(initialsFrom("Jan de Vries")).toBe("JV");
  });

  it("takes a single letter from a single word", () => {
    expect(initialsFrom("Jan")).toBe("J");
  });

  it("uppercases what it finds", () => {
    expect(initialsFrom("jan vries")).toBe("JV");
  });

  it("ignores surrounding and repeated whitespace", () => {
    expect(initialsFrom("  Jan   de   Vries  ")).toBe("JV");
  });

  it("returns nothing for an empty name", () => {
    expect(initialsFrom("   ")).toBe("");
  });

  /*
   * `name[0]` would cut a surrogate pair in half and render a replacement
   * glyph, which is why the implementation uses `Array.from`.
   */
  it("keeps a character outside the basic plane whole", () => {
    expect(initialsFrom("𝒥an 𝒱ries")).toBe("𝒥𝒱");
  });
});

describe("Avatar", () => {
  it("shows the fallback initials while the image is still loading", () => {
    renderAvatar();
    expect(screen.getByText("JV")).toBeDefined();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("keeps the initials when the image fails", () => {
    renderAvatar();

    act(() => {
      lastImage().fail();
    });

    expect(screen.getByText("JV")).toBeDefined();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("swaps the initials for the image once it loads", () => {
    renderAvatar();

    act(() => {
      lastImage().load();
    });

    expect(screen.getByRole("img", { name: "Jan de Vries" })).toBeDefined();
    expect(screen.queryByText("JV")).toBeNull();
  });

  it("prefers explicit children over the derived initials", () => {
    render(
      <Avatar>
        <AvatarFallback name="Jan de Vries">?</AvatarFallback>
      </Avatar>
    );
    expect(screen.getByText("?")).toBeDefined();
    expect(screen.queryByText("JV")).toBeNull();
  });

  it("renders an empty fallback when it has neither children nor a name", () => {
    render(
      <Avatar>
        <AvatarFallback data-testid="terugval" />
      </Avatar>
    );
    expect(screen.getByTestId("terugval").textContent).toBe("");
  });

  it("defaults to the medium size", () => {
    renderAvatar();
    expect(classesOf(screen.getByTestId("avatar"))).toContain("size-10");
  });

  it("applies the requested size instead of the default", () => {
    render(<Avatar data-testid="avatar" size="lg" />);
    const classes = classesOf(screen.getByTestId("avatar"));
    expect(classes).toContain("size-12");
    expect(classes).not.toContain("size-10");
  });

  it("lets className override a base class on the root", () => {
    renderAvatar({ rootClassName: "rounded-md" });
    const classes = classesOf(screen.getByTestId("avatar"));
    expect(classes).toContain("rounded-md");
    expect(classes).not.toContain("rounded-full");
  });

  it("lets className override a base class on the fallback", () => {
    render(
      <Avatar>
        <AvatarFallback
          className="bg-red-500"
          data-testid="terugval"
          name="Jan"
        />
      </Avatar>
    );
    const classes = classesOf(screen.getByTestId("terugval"));
    expect(classes).toContain("bg-red-500");
    expect(classes).not.toContain("bg-surface");
  });

  it("lets className override a base class on the image", () => {
    renderAvatar({ imageClassName: "object-contain" });

    act(() => {
      lastImage().load();
    });

    const classes = classesOf(screen.getByRole("img"));
    expect(classes).toContain("object-contain");
    expect(classes).not.toContain("object-cover");
  });

  it("forwards refs to the root, the image and the fallback", () => {
    const root = createRef<HTMLSpanElement>();
    const fallback = createRef<HTMLSpanElement>();
    const image = createRef<HTMLImageElement>();

    render(
      <Avatar ref={root}>
        <AvatarImage
          alt="Jan"
          ref={image}
          src="https://example.invalid/jan.png"
        />
        <AvatarFallback name="Jan" ref={fallback} />
      </Avatar>
    );

    expect(root.current).toBeInstanceOf(HTMLSpanElement);
    expect(fallback.current).toBeInstanceOf(HTMLSpanElement);

    act(() => {
      lastImage().load();
    });

    expect(image.current).toBe(screen.getByRole("img"));
  });

  it("spreads arbitrary props onto the root and the fallback", () => {
    render(
      <Avatar data-testid="avatar" lang="nl">
        <AvatarFallback data-testid="terugval" lang="nl" name="Jan" />
      </Avatar>
    );
    expect(screen.getByTestId("avatar").getAttribute("lang")).toBe("nl");
    expect(screen.getByTestId("terugval").getAttribute("lang")).toBe("nl");
  });
});
