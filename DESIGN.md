---
version: alpha
name: SMOG & Co
description: The design language of SMOG & Co, short videos of SMOG gestures (Spreken Met Ondersteuning van Gebaren) on the web (TanStack Start, Tailwind 4) and in the Expo app (NativeWind on Tailwind 3), both generated from one token set in packages/styles/src/tokens.ts. Direction "De lijn die praat", the line that talks.
colors:
  brand-green: "#00805F"
  brand-orange: "#EE971C"
  background: "#F6F8F5"
  foreground: "#17211A"
  card: "#FFFFFF"
  card-foreground: "#17211A"
  popover: "#FFFFFF"
  popover-foreground: "#17211A"
  muted: "#ECF1EC"
  muted-foreground: "#56635A"
  secondary: "#E7EDE8"
  secondary-foreground: "#17211A"
  surface-sunken: "#ECF1EC"
  accent: "#E4F1EA"
  accent-foreground: "#17211A"
  border: "#D5DED7"
  border-subtle: "#E3E9E4"
  input: "#6E7B72"
  ring: "#B36B0B"
  primary: "#00805F"
  primary-foreground: "#FFFFFF"
  primary-foreground-muted: "#F0F9F5"
  primary-ring: "#FFFFFF"
  primary-strong: "#006B50"
  primary-subtle: "#E4F1EA"
  sidebar: "#09564C"
  sidebar-foreground: "#FFFFFF"
  sidebar-foreground-muted: "#D3E9E2"
  sidebar-accent: "#0F6A5E"
  sidebar-accent-foreground: "#FFFFFF"
  sidebar-border: "#2E7A6F"
  sidebar-primary: "#EE971C"
  sidebar-primary-foreground: "#17211A"
  sidebar-ring: "#FFFFFF"
  highlight: "#EE971C"
  highlight-foreground: "#17211A"
  highlight-strong: "#9A5700"
  destructive: "#C62828"
  destructive-foreground: "#FFFFFF"
  danger-strong: "#A61F1F"
  danger-subtle: "#FBE9E9"
  success: "#1F8A4C"
  success-strong: "#166B3A"
  success-subtle: "#E3F3EA"
  warning: "#B7791F"
  warning-strong: "#7A4D06"
  warning-subtle: "#FBF0DA"
  chart-1: "#00805F"
  chart-2: "#B36B0B"
  chart-3: "#2F6DB5"
  chart-4: "#8250B5"
  chart-5: "#C0392B"
typography:
  display:
    fontFamily: Figtree
    fontSize: 40px
    lineHeight: 44px
    fontWeight: 700
    letterSpacing: -0.022em
  display-md:
    fontFamily: Figtree
    fontSize: 56px
    lineHeight: 60px
    fontWeight: 700
    letterSpacing: -0.028em
  title-1:
    fontFamily: Figtree
    fontSize: 28px
    lineHeight: 34px
    fontWeight: 600
    letterSpacing: -0.016em
  title-2:
    fontFamily: Figtree
    fontSize: 22px
    lineHeight: 28px
    fontWeight: 600
    letterSpacing: -0.01em
  title-3:
    fontFamily: Figtree
    fontSize: 18px
    lineHeight: 24px
    fontWeight: 600
    letterSpacing: -0.005em
  lead:
    fontFamily: Figtree
    fontSize: 18px
    lineHeight: 28px
    fontWeight: 400
    letterSpacing: -0.003em
  body:
    fontFamily: Figtree
    fontSize: 16px
    lineHeight: 24px
    fontWeight: 400
    letterSpacing: 0em
  body-sm:
    fontFamily: Figtree
    fontSize: 14px
    lineHeight: 20px
    fontWeight: 400
    letterSpacing: 0.005em
  caption:
    fontFamily: Figtree
    fontSize: 12px
    lineHeight: 16px
    fontWeight: 400
    letterSpacing: 0.012em
rounded:
  sm: 6px
  md: 10px
  lg: 14px
  xl: 20px
  card: 20px
  pill: 9999px
  full: 9999px
spacing:
  "1": 4px
  "2": 8px
  "3": 12px
  "4": 16px
  "5": 20px
  "6": 24px
  "8": 32px
  "10": 40px
  "12": 48px
  "16": 64px
  touch: 44px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.pill}"
    height: "{spacing.touch}"
  button-primary-hover:
    backgroundColor: "{colors.primary-strong}"
  button-action:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.highlight-foreground}"
    rounded: "{rounded.pill}"
    height: "{spacing.touch}"
  button-danger:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.pill}"
  field:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.pill}"
    height: "{spacing.touch}"
  chip:
    rounded: "{rounded.pill}"
    height: "{spacing.touch}"
  chip-selected:
    backgroundColor: "{colors.primary-subtle}"
    textColor: "{colors.primary-strong}"
  chip-active-filter:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.highlight-foreground}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.card}"
  deep-surface:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.sidebar-foreground}"
  deep-surface-hover:
    backgroundColor: "{colors.sidebar-accent}"
    textColor: "{colors.sidebar-accent-foreground}"
  active-mark:
    backgroundColor: "{colors.sidebar-primary}"
  badge-accent:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.highlight-foreground}"
    rounded: "{rounded.full}"
  alert-warning:
    backgroundColor: "{colors.warning-subtle}"
    textColor: "{colors.warning-strong}"
    rounded: "{rounded.card}"
  alert-success:
    backgroundColor: "{colors.success-subtle}"
    textColor: "{colors.success-strong}"
    rounded: "{rounded.card}"
  alert-danger:
    backgroundColor: "{colors.danger-subtle}"
    textColor: "{colors.danger-strong}"
    rounded: "{rounded.card}"
---

# SMOG & Co

## Overview

SMOG & Co is a catalogue of short videos of SMOG gestures. SMOG means Spreken Met Ondersteuning van Gebaren: gestures support spoken communication. Parents, carers, teachers and people with a communication disability use the videos as a memory aid alongside a SMOG course or initiation, so finding a gesture and playing its video comes first. SMOG is the method and keeps its Dutch name in every language; SMOG & Co is the product and the organisation. Dutch is the default language, with English and French.

The direction is "De lijn die praat", the line that talks. The logo already makes the move: a hand-drawn line touches a word and supports it, as a gesture supports speech. The interface repeats that move sparingly and keeps everything else calm: a cool paper page, one deep green that is also the backdrop of every video, an orange that says what to do, Figtree tuned for display, and round controls large enough for every hand. Web and app share one token set and the same component names, so a screen looks and behaves the same on both.

The approved Dutch tagline is "Mensen gaan van nature hun spraak ondersteunen met gebaren"; English and French carry the same meaning and no competing slogan is invented. The voice is warm, direct and concrete, with familiar words about speaking, gestures and learning. Copy never uses an em dash, presents the videos as a memory aid and never as a course, and promises nothing it cannot keep.

## Colors

- **Green says where you are.** The deep green (`sidebar` and its family) is the one green surface: the header, the home hero, the auth panel, banners, the admin rail and the native stack headers. It is a step deeper than the studio teal behind every gesture video, so a page and its videos read as one place, and deep enough for an orange mark. Text on it is `sidebar-foreground`, secondary text `sidebar-foreground-muted`, hover `sidebar-accent`.
- **The brand green is for controls.** `primary` (the brand green) fills buttons, switches, checkboxes and the done steps of a stepper, and colours links and icons. It is never a large surface, and nothing translucent or lighter sits behind text on it. Green text on a light surface is `primary-strong`.
- **Orange means do it.** `highlight` marks the action: play, the search action, the active filter, the current step of the sponsor flow, the primary action on the deep green. It is a fill under dark ink (`highlight-foreground`) or a mark on the deep green (`sidebar-primary`, the current item of a navigation). It is never text on a light surface and never sits on the brand green; orange text or icons on a light surface use `highlight-strong`.
- **`accent` is not the orange.** It is the quiet green tint for hovered and selected rows; registry components rely on it. `primary-subtle` is the same tint as a background for green text (selected chips, category badges, tinted boxes).
- **The page is a cool paper.** `background` for the page, `card` and `popover` (white) for raised surfaces, `muted` and `secondary` for quiet controls, `surface-sunken` for wells.
- **Form controls are outlined in `input`**, the only neutral border that passes the 3:1 control contrast; `border` and `border-subtle` are decorative dividers.
- **The focus ring** is `ring` (a dark orange) on light surfaces and white on any green surface (`sidebar-ring`, `primary-ring`).
- **Status** text is a `*-strong` colour on its `*-subtle` tint; `success` and `warning` alone are for icons, never fills under white text. `destructive` is a solid fill under `destructive-foreground` for danger buttons.
- **Charts** use `chart-1` to `chart-5` as fills, with their values also printed as text.
- Every pair that carries text or a mark is listed in `packages/styles/src/contrast.ts` and tested in both themes (4.5:1 for body text, 3:1 for large text, controls, marks and focus rings). A new pair goes there before it is used. The web theme closes the colour namespace and the app forbids hex values, so only these roles exist.
- The browser bar (`theme-color`), the web manifest and the installed app's splash follow the header's deep green (`tokens.chrome`).

## Themes

The app follows the system theme or the user's choice. Dark mode is a deep teal-black page; green surfaces stay deep green with light text, and the brand green becomes a lighter mint for controls only, under dark ink. The installed DESIGN.md specification has no theme syntax, so the dark values are listed here.

| Role | Light | Dark |
| --- | --- | --- |
| background | #F6F8F5 | #0C1513 |
| foreground | #17211A | #EAF1EC |
| card | #FFFFFF | #121D1A |
| popover | #FFFFFF | #18241F |
| muted | #ECF1EC | #18231F |
| muted-foreground | #56635A | #9DB2AA |
| secondary | #E7EDE8 | #1C2823 |
| surface-sunken | #ECF1EC | #070D0B |
| accent | #E4F1EA | #163631 |
| border | #D5DED7 | #283631 |
| border-subtle | #E3E9E4 | #1C2723 |
| input | #6E7B72 | #6C817A |
| ring | #B36B0B | #F5AB45 |
| primary | #00805F | #2BB38A |
| primary-foreground | #FFFFFF | #04140E |
| primary-strong | #006B50 | #2BB38A |
| primary-subtle | #E4F1EA | #0E2A25 |
| sidebar | #09564C | #0E2E29 |
| sidebar-foreground | #FFFFFF | #EAF1EC |
| sidebar-foreground-muted | #D3E9E2 | #A9C7BE |
| sidebar-accent | #0F6A5E | #174A41 |
| sidebar-border | #2E7A6F | #1F4A42 |
| sidebar-primary | #EE971C | #F5AB45 |
| sidebar-ring | #FFFFFF | #EAF1EC |
| highlight | #EE971C | #F5AB45 |
| highlight-foreground | #17211A | #04140E |
| highlight-strong | #9A5700 | #F5AB45 |
| destructive | #C62828 | #F16B6B |
| destructive-foreground | #FFFFFF | #1C0707 |
| danger-strong | #A61F1F | #F16B6B |
| danger-subtle | #FBE9E9 | #3A1717 |
| success-strong | #166B3A | #4CC27E |
| success-subtle | #E3F3EA | #123021 |
| warning-strong | #7A4D06 | #E9B24A |
| warning-subtle | #FBF0DA | #33260B |

In dark mode a level-1 raised card has no shadow; it is drawn with a border on `popover`.

## Typography

- **Figtree is the only typeface.** The web self-hosts the variable font behind a metric-matched fallback, so the swap shifts nothing; the app embeds Regular, Medium, SemiBold and Bold. Email uses the system font stack.
- **The type is tuned as part of the identity**: tracking tightens and leading falls as the size grows, and small steps open up slightly. The values live in the type steps, so a screen never sets `tracking-*` or `leading-*` on a named step.
- **Use the named steps.** `display` for the one big statement of a screen (the home hero, a status page), bold, growing to `display-md` from the `md` breakpoint on the web; `lead` for the line under a display title; `title-1` to `title-3` for headings, semibold; `body` for running text and controls; `body-sm` for secondary text and dense rows; `caption` only for text that repeats something said elsewhere.
- Body text is never below 16 px, and anything a person must read to act (hints, errors, legal lines, step names) never below 14 px. Weights below regular are not used.
- Paragraphs avoid a lone last word (`text-pretty` on the web `Text`); headings balance their lines.
- On native every text carries a weight class (`font-regular`, `font-medium`, `font-semibold`, `font-bold`); without one it renders in the system font.

## Layout

- One spacing scale is shared by web and app, keyed like Tailwind, so `p-4` is the same on both.
- **Every interactive target is at least `touch`**: `md` controls by size, `lg` larger, `sm` controls keep a smaller box with an invisible `touch`-sized hit area (web) or `hitSlop` (native).
- Content is capped at the content width with gutters that widen from phone to desktop; reading text is capped at the reading width.
- A deep green hero sits directly under the header in the same green, as one band.

## Elevation & Depth

- Three shadow levels: `shadow-1` for resting cards, `shadow-2` for dialogs, popovers and floating banners, `shadow-3` for the highest overlays. Light shadows are tinted with the foreground ink.
- In dark mode level 1 has no shadow (a border and `popover` instead); levels 2 and 3 are deeper black shadows.
- Separation comes first from the surface colour and a 1 px edge, not from shadow.

## Shapes

- **The pill is the brand shape.** Every control a finger presses or types into is `rounded.pill`: buttons, icon buttons, fields, selects, search fields, chips, toggles, tabs, on the web, in the app and in email. A multi-line text area keeps a softer corner.
- **One card frame**: `rounded.card` for cards, gesture tiles, the video frame, banners and alerts.
- Badges, avatars and the favourite button are fully round. The smaller steps (`sm` to `xl`) are for inner parts and overlays.
- Gesture stills are 3:4 portrait inside the card frame, with the orange play glyph and the heart over the still.

## Components

- **Logo.** The SMOG & Co wordmark with hands drawn into the letters, in one flat colour: green on the page, white on the deep green. Its accessible name is the brand name, or it is hidden when the name is in adjacent text. The full logo with hands is at least 32 px tall; below that the small mark.
- **Hands.** The brand's only illustration motif, each with one fixed meaning: pointing across means find or search, pointing down means this one, the open palm means welcome or nothing here yet. A hand is never chosen at random or cycled, and category chips are text only. Hands are decorative and hidden from assistive technology, and nothing behind body text on green is stronger than a faint texture.
- **The line.** A single hand-drawn line of constant weight that points at, underlines or rests under a word. At most one per screen.
- **Buttons.** `primary` (the brand green), `action` (the orange do it, dark ink), `secondary` (outline), `ghost`, `danger`. On a deep green surface the primary action is `action`, the others white; native `Surface` switches them, the web header uses `GREEN_PRIMARY_BUTTON`.
- **Navigation on green.** The current item carries the orange `sidebar-primary` mark on the plain deep green (a bar under the label in the header, at the start edge in the rail); hover is the `sidebar-accent` wash, so hover never looks like "you are here".
- **Chips and the stepper.** A selected filter chip is the green tint; the active filter of a search is the orange `action` tone. The sponsor flow's stepper marks its current step orange (`tone="action"`); done steps stay green.
- **Fields** are outlined in `input` on a `card` fill, darken their border on hover and turn it `destructive` when invalid.
- **Focus** is a 2 px ring with a 2 px offset: `ring` on light surfaces, white on green (`focusRingOnGreen` on the web).
- **Press.** Compact controls answer a touch: they shrink slightly while pressed (`press` on the web); cards and rows do not.
- **Motion.** The interface moves like a calm hand: it arrives quickly, settles slowly, grows from where you pointed and never bounces. Things appearing or leaving ease out (`enter`), sheets slide on the drawer curve, something already on screen moving to a new place uses `move`, hover and colour stay on `standard`. Menus, selects, hover cards and tooltips grow from their trigger; dialogs pop from the centre; the search palette opens and closes instantly. The favourite heart is the one bounce: it pops, dips and settles. A hand drawing itself once takes the `gesture` duration. Under reduced motion nothing moves: every duration and every delay is zero on the web and native skips the animation.
- **Feedback on native** adds haptics: a warning haptic on danger buttons, a selection haptic on chips, switches and toggles.
- **Alerts and banners** use the `*-subtle` tint with `*-strong` text.
- **Sponsor end card.** A sponsor's name and logo appear as an end card over the gesture's own video; nothing is rendered into it. Its look and motion are in "Video player".
- **Email** uses the light theme resolved to literal values: the deep green header band with the white logo, a pill button in the brand green, the card frame. **Lesson PDFs** print in the same light roles.

## Video player

The gesture video is the product, so its player carries the brand. Web (`VideoPlayer`, `GestureTitle`, `SponsorEndCard`, `GestureThumbnail` in `@smog/ui-web`) is the reference; the app mirrors these values (its player keeps the platform's native controls, so the skin rows apply to the overlays and the play affordance only).

**Frame.** 3:4, the card frame (`rounded.card`), the deep green (`sidebar`) behind the picture while it loads. Every overlay length below is a share of the frame's **width** (web: `cqw` inside an `@container`; native: computed from the measured frame width, `onLayout`), so it scales with the frame from a 160 px card to fullscreen.

**Stills and posters.** Taken one second in (`GESTURE_STILL_SECONDS = 1` in `@smog/utils`): the title and the movement starting, never the white closing slate that the middle of the shortest clips lands on. Under every still sits its placeholder: the deep green with the gesture's title (below), or the pointing hand alone (40 % of the width, centred) on a frame too small to read a name. It shows while the still loads and replaces it when it fails. Never a blank tile or a lone letter.

**The title: "the hand points at the word".** The kit draws the same title the burned-in videos open with, so a textless video, a missing still and an old video look alike (overlaid on a burned-in clip, it covers it within a few pixels).

| Part | Value |
| --- | --- |
| Hand | `handSvgs[1]` (pointing across), white, 23 % wide (height follows the 2:1 drawing), starting 6 % from the left |
| Hand height | its centre 3.5 % lower than the name's (web: `margin-top: 7cqw` in a centred row) |
| Name | Figtree Regular (never bold), white, line height 1.05, tracking -0.01 em, starting 30 % from the left (0.5 % after the hand) |
| Name size | 10.7 % of the width (cap height about 6.7 %); a long word steps it down so the longest word fits in 64 % of the width: `min(10.7, 64 / (letters × 0.55))` % of the width (`titleFontSize`); names wrap only at spaces |
| Position | the row's centre 20.7 % down the frame (of its height); 6 % inset on both sides |
| Contrast | white on the studio set (`#0B5F55`, about 7.5:1); no scrim, no shadow, no pill |
| Motion | fades in (`fade-in`, `duration-normal`, `ease-enter`); it never slides over the gesture; none under reduced motion |
| Access | decorative (`aria-hidden`): the frame's own label is the accessible name; taps pass through |
| When | only for a textless video (`needsRecut` false) and while `preferences.hideGestureName` is off |

**Play.** One play affordance everywhere: the orange `highlight` disc with the dark `highlight-foreground` triangle. On the player it is 64 px with a `shadow-2`, scales to 0.94 while pressed and has a white 2 px focus ring; on cards it is the 36 px badge at the bottom left of the still. Never black, never a bare triangle.

**Controls (web).** Figtree, white icons on a transparent bar, hover a 16 % white wash, the scrubber a 4 px pill track with the played part in `primary` and a 14 px thumb. Kept: play/pause, the scrubber, the time, mute, speed and fullscreen (of the frame, so the overlays stay). Speed toggles 1x and 0.5x, for studying the movement. Removed: the ten-second seeks (the clips are a few seconds long), the volume slider (most clips are silent), picture-in-picture, cast and AirPlay. Looping is the page's choice (`loop`), not a button.

**Sponsor end card.** Over the last 4 seconds (`END_CARD_SECONDS`, never before the middle of a short clip), as part of the film, not a card on top of it:

| Part | Value |
| --- | --- |
| Band | full width at the bottom of the frame, a gradient of the deep `sidebar` green, solid over its lower 70 % and fading to transparent above; the text sits on the solid part |
| Padding | 6 % of the width at the sides, 18 % above the text, 16 px below (web adds 64 px under it to clear the control bar) |
| Message | `endCard.message` ("Mogelijk gemaakt door", "Made possible by", "Rendu possible grâce à"), `body-sm`, `sidebar-foreground-muted` |
| Name | as typed, `title-3` semibold, `sidebar-foreground`, wraps anywhere |
| Logo | optional, 40 px, `object-contain` on a light plate (`sidebar-foreground`, 6 px padding, `rounded.md`), before the text |
| Enter | rises 8 px and fades in, `duration-slow` (320 ms), `ease-enter` |
| Leave | fades out and drops 8 px, `duration-normal` (200 ms), `ease-standard`; it stays mounted while hidden, so a loop or a seek back makes it leave gently instead of vanishing |
| Reduced motion | appears and goes at once |
| Access | decorative (`aria-hidden`); the page states the credit in text; taps pass through |

The real clips end on the white SMOG slate, so during its four seconds the band sits over white; that is intended (credits over the closing slate).

## Do's and Don'ts

- Do keep green for where you are and orange for what to do.
- Don't put orange text or icons on a light surface; use `highlight-strong`. Don't put orange on the brand green.
- Don't use the brand green as a large surface, and don't put a lighter tint or transparency behind text on it.
- Don't use `success` or `warning` as a fill under white text; use the `*-subtle` and `*-strong` pair.
- Don't write raw palette classes, hex colours or arbitrary values in the app; use the roles. Don't use the retired role names `surface`, `surface-raised`, `danger`, `foreground-muted` or `focus-ring`.
- Don't make a target smaller than `touch`, and don't give a control a rectangle where the kit has a pill.
- Don't animate under reduced motion, and don't let anything bounce except the heart.
- Don't add a second typeface.
- Don't pick a hand at random; each hand has one meaning. Errors show the open palm in `primary` on a pale red (`danger-subtle`) disc; no results and search show the hand pointing across; nothing here yet shows the open palm.
- Don't use an em dash in any copy, don't change or paraphrase the Dutch tagline, and don't present the videos as a course.
