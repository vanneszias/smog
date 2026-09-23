import { notFound } from "next/navigation";
import { isKitchenSinkAvailable } from "./guard";
import { DomainSection } from "./sections/DomainSection";
import { FeedbackSection } from "./sections/FeedbackSection";
import { FormsSection } from "./sections/FormsSection";
import { LayoutSection } from "./sections/LayoutSection";
import { OverlaysSection } from "./sections/OverlaysSection";
import { TokensSection } from "./sections/TokensSection";
import { ThemeToggle } from "./ThemeToggle";

const SECTIONS = [
  { id: "tokens", label: "Tokens" },
  { id: "forms", label: "Form primitives" },
  { id: "layout", label: "Layout" },
  { id: "feedback", label: "Feedback" },
  { id: "overlays", label: "Overlays" },
  { id: "domain", label: "Domain" },
];

/**
 * Every component in `@smog/ui-web`, in every state, on one page.
 *
 * This is how the library gets reviewed: a component rendered next to its
 * siblings is the only place an inconsistency shows up, and it is the only
 * place a token that reads fine in isolation can be caught reading wrong
 * against the surface it will actually sit on.
 *
 * It is also the first thing in `apps/` to import the package at all, so it
 * is where anything that only fails outside jsdom fails.
 */
export default function KitchenSinkPage() {
  if (!isKitchenSinkAvailable(process.env.NODE_ENV)) {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-12">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-bold text-foreground text-xxl">Kitchen sink</h1>
          <ThemeToggle />
        </div>
        <p className="max-w-3xl text-foreground-muted text-md">
          Every export of <code>@smog/ui-web</code>, in every variant, size and
          state, painted from the tokens in <code>@smog/styles</code>. Switch
          the theme with the button above; nothing on this page uses a{" "}
          <code>dark:</code> utility.
        </p>
        <nav aria-label="Secties">
          <ul className="flex flex-wrap gap-3">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  className="text-primary text-sm underline underline-offset-2"
                  href={`#${section.id}`}
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <TokensSection />
      <FormsSection />
      <LayoutSection />
      <FeedbackSection />
      <OverlaysSection />
      <DomainSection />
    </div>
  );
}
