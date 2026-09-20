import { type ThemeName, toCssVariables, tokens } from "@smog/styles";

/**
 * Renders `theme.css`: the token object expressed as Tailwind v4 theme
 * variables.
 *
 * Nothing here types a colour, a size or a duration. Every declaration comes
 * out of `@smog/styles` through `toCssVariables`, which is the same function
 * the token tests cover — so a token change reaches the stylesheet by
 * regeneration, never by someone remembering to edit both.
 */

const HEADER = `/*
 * GENERATED FILE — do not edit.
 *
 * Produced by \`bun -F @smog/ui-web generate:theme\` from @smog/styles.
 * Change a value in packages/styles/src/tokens.ts and regenerate; theme.test.ts
 * fails while this file and the tokens disagree.
 */`;

const THEME_NOTE = `/*
 * Light values. Tailwind v4 emits these onto \`:root\` and builds the matching
 * utilities, so \`bg-primary\`, \`text-foreground\` and \`rounded-md\` resolve to
 * tokens instead of Tailwind's own palette and scales.
 */`;

const DARK_NOTE = `/*
 * Dark values: the same custom properties, re-declared. Every utility reads
 * its variable at use time, so re-theming the subtree under \`.dark\` takes no
 * \`dark:\` classes at all.
 */`;

const ALIAS_NOTE = `/*
 * Tailwind keeps its type scale in the \`--text-*\` namespace; ours is
 * \`--font-size-*\` / \`--line-height-*\`, because "font size" is what native
 * calls it too. Aliased here rather than renamed, so one name serves both
 * platforms.
 */`;

function declarations(theme: ThemeName): string[] {
  return toCssVariables(tokens, theme).split("\n");
}

/** The declarations dark actually changes — the rest are theme-independent. */
function darkOverrides(): string[] {
  const light = new Set(declarations("light"));
  return declarations("dark").filter((line) => !light.has(line));
}

function textScaleAliases(): string[] {
  return Object.keys(tokens.fontSize).flatMap((key) => [
    `--text-${key}: var(--font-size-${key});`,
    `--text-${key}--line-height: var(--line-height-${key});`,
  ]);
}

function block(selector: string, lines: string[]): string {
  const body = lines.map((line) => `  ${line}`).join("\n");
  return `${selector} {\n${body}\n}`;
}

export function renderThemeCss(): string {
  return `${[
    HEADER,
    THEME_NOTE,
    block("@theme", declarations("light")),
    DARK_NOTE,
    block(".dark", darkOverrides()),
    ALIAS_NOTE,
    block("@theme inline", textScaleAliases()),
  ].join("\n\n")}\n`;
}
