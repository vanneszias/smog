# @smog/brand

The SMOG & Co artwork (`src/art`) and the generator that renders every icon,
logo and brand file the site and the app ship from it. Run
`bun -F @smog/brand generate` after changing the artwork or the plan in
`src/compose.ts`; the drift tests fail until the committed outputs match.

## The artwork

| File | What it is | Use it |
| --- | --- | --- |
| `logo.svg` | The full horizontal logo: the letters with three hairline hands touching them | 32 px tall or more |
| `logo-stacked.svg` | The full stacked logo | 32 px tall or more; the app splash |
| `logo-small.svg` | The same letters and hands, the hands re-drawn at a line weight that holds | 20 to 32 px tall (a header at small widths) |
| `mark.svg` | The small mark: the logo's pointing hand reduced to its outline, heavy line | 16 to 48 px (favicon, tight spaces), always on its own |
| `icon-hand.svg` | The app icon glyph: the logo's pointing hand, all lines, bold | Only on the brand green, as the app and web app icon |
| `hand-1.svg`, `hand-2.svg`, `hand-3.svg` | The three hand illustrations, as strokes | Illustrations, 48 px tall or more |
| `smog.icon/` | The iOS 26 layered icon (Icon Composer): the hand outlined on the brand green | Copied to the app as is |
| `previous/` | The wordmark store icon and its `.icon` package, kept unchanged | To go back to the old icon |

### Minimum sizes

- The full logo (`logo.svg`, `logo-stacked.svg`) needs at least **32 px of
  height**. Below that its hairline hands render as specks.
- From 20 to 32 px tall, use `logo-small.svg`.
- Below 20 px, or where a square is needed (favicon, 16 to 48 px), use
  `mark.svg`.
- The hand illustrations need at least **48 px of height**. At 24 px the
  fingers close up into a blob, whatever the stroke width.

## The three hands

Each hand has one fixed meaning. Use the hand for what it means. Never pick
one at random or cycle through them.

| File | `handSvgs[i]` | Pose | Meaning |
| --- | --- | --- | --- |
| `hand-1.svg` | `0` | Pointing down | **This one**: the chosen or featured gesture, the current step |
| `hand-2.svg` | `1` | Pointing across | **Find**: search, go there; the hero hand that points at the search field |
| `hand-3.svg` | `2` | Open palm | **Welcome**, or **nothing here yet**: empty states, sign-in, thanks |

They are the same three drawings as the hands in the logo: `hand-2` touches
the S, `hand-1` points into the O and `hand-3` rests under C and O.

How they are drawn:

- One open, stroked line: `fill="none"`, `stroke="currentColor"`, round caps
  and joins, and one `stroke-width` (2) on the root `<svg>`. Every path has
  `vector-effect="non-scaling-stroke"`, so the line keeps the same pixel
  weight at any size. Set it from CSS on the `svg` element, for example
  `stroke-width: 1.5` for small inline use and `2.5` at hero size. A CSS
  rule beats the presentation attribute.
- Each path has `pathLength="1"`, and the paths are in drawing order: the
  back of the hand and the palm side from the wrist to the fingertip first,
  then the creases. A reveal sets `stroke-dasharray: 1` and animates
  `stroke-dashoffset` from 1 to 0, staggered per path.
- They are centre lines traced from the earlier filled drawings, then
  smoothed. Pose and proportions are unchanged. See `docs/DECISIONS.md`,
  "Brand art: stroked hands, small logo, mark and hand app icon".

## The app icon

The icon is one bold hand (the logo's pointing hand, `icon-hand.svg`) in
white on the brand green `#00805F`. The generator renders the store icon
(`apps/mobile/assets/icon.png`), the Android adaptive foreground and
monochrome layers (the background is the green from `app.config.ts`), and
the web app icons (`icon-192`, `icon-512`, the maskable icon and
`apple-touch-icon`). The favicon (`favicon.ico` at 16, 32 and 48 px and
`icon.svg`) uses the small mark instead.

`smog.icon/Assets/hand.svg` is `icon-hand.svg` with its strokes outlined to
one filled path (Icon Composer layers are filled shapes). It is not
generated. If you change `icon-hand.svg`, outline it again (in a vector
editor: outline stroke, then unite) at 676 pt wide and replace the file.

Changing the icon changes the native build, so it needs an EAS build and a
store release. An OTA update cannot change it.

To go back to the wordmark icon, revert the commit that introduced the hand
icon. Or do it by hand:

1. Copy `previous/smog-wordmark.icon` over `smog.icon`.
2. Point the square and circle icons in `src/compose.ts` back at
   `logo-stacked.svg`.
3. Have `scripts/generate.ts` copy `previous/icon-wordmark.png` to
   `apps/mobile/assets/icon.png` instead of rendering it.
