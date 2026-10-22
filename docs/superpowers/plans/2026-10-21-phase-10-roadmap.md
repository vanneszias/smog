# Phase 10 roadmap: rebrand, i18n of everything, teacher lessons

Status: **requirements agreed with the owner (2026-10-21); specs not written yet.** Each track gets its own spec (for the owner's approval), then a plan, then step-by-step implementation that deploys to staging after each step, as in phases 0 to 9.

## Agreed requirements

### Track 1: rebrand with shadcn (first)
- Web: shadcn/ui and its blocks (https://ui.shadcn.com/blocks). Mobile: React Native Reusables. Use an existing component before writing one; a custom component needs a reason.
- The owner has no brand to hand over: **propose a brand identity** (palette, type, tone) from the current SMOG logo, for approval before it is applied. Light and dark.
- **Full redesign including the information architecture**, not only styling. Existing behaviour and e2e tests are kept and updated; a11y and perf budgets stay enforced.

### Track 2: i18n of everything (second)
- Languages are data: nl, fr and en to start; an admin can add a language in the UI.
- Interface strings live in D1, edited in an admin table (key, source, one column per language, missing filter) **and** by import/export (JSON/CSV). Shipped catalogues remain the fallback.
- Gestures: name and search keywords per language. Search matches the active language's name and keywords.
- Videos: **one textless video per gesture**; the name is overlaid per language in the player (Remotion where a flattened MP4 is needed). Existing burned-in videos stay visible as a fallback until replaced; admins get a "needs re-cut" list. The owner re-cuts the videos.
- Audio: a spoken pronunciation of the gesture name, **one clip per language per gesture**, uploaded in the admin.
- Missing translation: fall back to a chosen default language and flag it for admins.
- New **translator** role, limited to the translation screens.

### Track 3: teacher lessons (third)
- New **teacher** role, assigned by an admin.
- Gestures get private fields (fixed fields plus an optional free-form notes field, each translatable), visible to teachers and admins only. The fields and the PDF styling come from the owner's PDFs (**not received yet**; the owner attaches them).
- Teachers build lessons on the web: pick gestures, order them, export a PDF. A lesson is a language-neutral list; the PDF language is chosen per export. Mobile only views or downloads the PDF.

## What the two PDFs show (read 2026-10-21)
Both are Word exports headed with the green **SMOG&CO** logo and a title ("Les 1" / "SMOG LES 1"), followed by a bordered table with one gesture per row.
- **Participants' sheet** (`SMOG-woordenlijst_les1_afbeeldingen_cursisten_2025.pdf`, 11 pages, about 75 words, 7 a page): left column = the word in bold plus a black-and-white line drawing (one or two numbered steps, a copyright mark); right column = short bullets: `A:`/`P:` handshape of the active and passive hand (`A & P` = both), technique notes ("touch", "lettergrepen", "2x", "ogen dicht", "niet tikken"), and a last `C:` line of related meanings the same sign covers.
- **Teachers' sheet** (`2024_DEFINITIEVE_versie_les_1_lesgevers.pdf`, 16 pages, no drawings): the word plus a labelled block, **HC** (handconfiguratie, bold: `P:`/`A:`/"beide handen"), **PL** (plaats, where the sign is made), **OR** (oriëntatie, palm directions), **BW** (beweging, the full movement description) and **C** (related meanings, upper case, with notes such as "(op lettergrepen)"); extra usage notes in brackets (for example how to sign "sugar to sprinkle", "stack of plates").
- So the private teacher fields are **HC, PL, OR, BW, C plus a free note**, per language; the participants' sheet is a shorter, illustrated view of the same data (A/P handshape, short technique tags, C, the drawing). One lesson, two PDF templates (participants and teachers).

## Lesson data decisions (owner, 2026-10-21)
- Private gesture fields per language: **HC, PL, OR, BW, C and a free note**, plus an optional short **summary** text for the participants' sheet (no automatic summarising).
- A teacher picks the PDF template per export: **for teachers** (HC, PL, OR, BW, C, note; no drawings) or **for participants** (word, drawing, summary or HC, C). Both come from the same data; the lesson stays a language-neutral list of gestures, the language is chosen per export.
- **Drawings** are uploaded per gesture in the admin: one image, optionally two numbered steps, with a credit line; private to teachers and PDFs.
- **C (related meanings)** is a per-language list that also feeds public search keywords; the PDF notes around it (for example "op lettergrepen") stay private.
- Technique tags (touch, syllables, repeat) were not chosen: they live in the free note and the summary for now.

## Order and gates
1. ~~Owner attaches the PDFs~~ done (both read).
2. Spec 1 (brand and design system), approval, plan, build, staging.
3. Spec 2 (i18n), approval, plan, build, staging.
4. Spec 3 (lessons), approval, plan, build, staging.

## Open items
- ~~The PDFs~~ received and decided (above).
- Brand proposal approval.
