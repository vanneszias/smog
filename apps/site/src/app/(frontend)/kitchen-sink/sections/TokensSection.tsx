import { Note, Section, Specimen } from "./Section";

/**
 * The three page surfaces, stacked, with and without an edge.
 *
 * This exists because of one number: in the light theme `background` and
 * `surface` are 1.06:1 apart. That is by design — they are not a text pairing
 * and no contrast test covers them — but it means a white card on a white
 * page is invisible unless something else draws its boundary. The pairs below
 * put the bordered and borderless versions of the same surface side by side
 * so a reviewer can see, rather than calculate, whether the hierarchy reads.
 */
const SURFACES = [
  { name: "background", className: "bg-background" },
  { name: "surface", className: "bg-surface" },
  { name: "surface-raised", className: "bg-surface-raised" },
] as const;

const BORDERS = [
  { name: "border-subtle", className: "border-border-subtle" },
  { name: "border", className: "border-border" },
  { name: "border-strong", className: "border-border-strong" },
] as const;

const FOREGROUNDS = [
  { name: "foreground", className: "text-foreground" },
  { name: "foreground-muted", className: "text-foreground-muted" },
] as const;

const FILLS = [
  { name: "primary", className: "bg-primary text-primary-foreground" },
  { name: "accent", className: "bg-accent text-accent-foreground" },
  { name: "success", className: "bg-success text-success-foreground" },
  { name: "warning", className: "bg-warning text-warning-foreground" },
  { name: "danger", className: "bg-danger text-danger-foreground" },
] as const;

export function TokensSection() {
  return (
    <Section id="tokens" title="Tokens">
      <Note>
        Every colour below is a semantic role from <code>@smog/styles</code>,
        read at use time from a CSS variable. Switching the theme re-declares
        the variables and repaints all of it without a single <code>dark:</code>{" "}
        utility.
      </Note>

      <Specimen label="Surfaces, stacked without an edge">
        <div className="w-full rounded-lg bg-background p-4">
          <p className="pb-2 text-foreground-muted text-sm">background</p>
          <div className="rounded-lg bg-surface p-4">
            <p className="pb-2 text-foreground-muted text-sm">surface</p>
            <div className="rounded-lg bg-surface-raised p-4">
              <p className="text-foreground-muted text-sm">surface-raised</p>
            </div>
          </div>
        </div>
      </Specimen>

      <Specimen label="The same three, each with border-subtle">
        {SURFACES.map((surface) => (
          <div
            className={`rounded-lg border border-border-subtle p-6 ${surface.className}`}
            key={surface.name}
          >
            <p className="text-foreground text-sm">{surface.name}</p>
          </div>
        ))}
      </Specimen>

      <Specimen label="Border roles on one surface">
        {BORDERS.map((border) => (
          <div
            className={`rounded-lg border bg-surface p-6 ${border.className}`}
            key={border.name}
          >
            <p className="text-foreground text-sm">{border.name}</p>
          </div>
        ))}
      </Specimen>

      <Specimen label="Foreground roles">
        {FOREGROUNDS.map((foreground) => (
          <p
            className={`text-md ${foreground.className}`}
            key={foreground.name}
          >
            {foreground.name} — Aangenaam kennis met je te maken
          </p>
        ))}
      </Specimen>

      <Specimen label="Filled roles and their foregrounds">
        {FILLS.map((fill) => (
          <div
            className={`rounded-md px-4 py-2 text-sm ${fill.className}`}
            key={fill.name}
          >
            {fill.name}
          </div>
        ))}
      </Specimen>
    </Section>
  );
}
