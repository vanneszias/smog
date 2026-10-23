# Phase 10c, spec 3: teacher lessons and PDFs (draft for approval)

Status: **draft, awaiting the owner's approval.** Track 3 of `docs/superpowers/plans/2026-10-21-phase-10-roadmap.md`. It builds on phase 10a (the shadcn admin kit) and phase 10b (languages as data, per-language gesture rows, roles as a set with `teacher`, the private R2 + presign flow, the audit guard).

## 1. Goal
A teacher picks gestures, arranges them into a lesson and exports a PDF for the teachers or for the participants, in the language the teacher chooses. For this the gestures get private teaching information (never public), drawings and a per-language text layer. The two reference PDFs (`SMOG-woordenlijst_les1_afbeeldingen_cursisten_2025.pdf`, the participants' sheet, and `2024_DEFINITIEVE_versie_les_1_lesgevers.pdf`, the teachers' sheet) define the content and the look.

## 2. Owner decisions
| Topic | Decision |
|---|---|
| Who sees a lesson | **All teachers see all lessons** (and admins); anyone with the teacher role can duplicate. Only the author or an admin edits or deletes (see 4.3) |
| Lesson fields | Title, optional lesson number and notes, **per language** (the PDF can be exported in nl, fr or en); gestures in order, optionally grouped in **sections** |
| PDF engine | **Server-side in the Worker** with a pure-JS PDF library, cached per lesson version, template and language; no new Cloudflare binding |
| Teacher info | Private fields **HC, PL, OR, BW, C, a free note, an optional short summary** per gesture per language, plus **drawings**; edited by teachers and admins in a "Teacher info" tab of the gesture editor; **translators only translate** them |
| Templates | "For teachers" (HC, PL, OR, BW, C, note; no drawings) and "For participants" (word, drawing, summary or HC, C), chosen per export, both from the same data |
| Drawings | Uploaded per gesture in the admin: one image, optionally a second numbered step, a credit line; private to teachers, admins and the PDFs |
| `C` (related meanings) | A per-language list that also feeds the public search keywords; the notes around it in the PDFs (for example "op lettergrepen") stay private |
| Where | The builder and the editors are web only; mobile lets a teacher open and download or share the PDFs of lessons |

## 3. What the PDFs show (read 2026-10-21)
Both are Word exports: A4 portrait, the green SMOG&CO logotype at the top left and a title ("Les 1" / "SMOG LES 1") beside it, then a bordered table, one gesture per row.
- **Participants' sheet** (11 pages, about 75 words, 7 rows a page): left cell = the word in bold, below it a black-and-white line drawing (one or two numbered steps, with a small copyright mark); right cell = short bullets: `A:` and `P:` for the active and passive hand's shape (`A & P` for both hands), movement notes ("touch", "lettergrepen", "2x", "ogen dicht"), and a last `C:` line of related meanings.
- **Teachers' sheet** (16 pages, no drawings): the word on the left; on the right a labelled block with the labels **HC** (handconfiguratie, in bold), **PL** (plaats), **OR** (oriëntatie), **BW** (beweging) and **C** (related meanings, upper case) in a narrow label column, plus bracketed usage notes.
The two sheets are therefore two views of one data set: the long fields (HC, PL, OR, BW, C, note) for the teachers; the word, the drawing, a short summary (or HC) and C for the participants.

## 4. Data model (migration 0024 onward; one migration per concern)
1. **`gesture_teacher_info`**: `gesture_id`, `locale`, `hc`, `pl`, `or_`, `bw`, `c_note`, `note`, `summary` (all text, default empty, bounded 2,000 characters), `updated_by`, `updated_at`; unique (gesture, locale). One row per language, like `gesture_translation`; a missing language falls back to the default language per field (the same `fallbackUsed` rule). **Never selected by any public read**: the public gesture queries use explicit column lists and a test fails if a teacher column appears in a public output schema.
2. **C list**: the per-language `gesture_keyword` rows (public, phase 10b) are the C words; `c_note` is the private text around them (the "(op lettergrepen)" parts). The PDF prints the keywords upper-cased in their order, then the note.
3. **`gesture_drawing`**: `gesture_id`, `step` (1 or 2), `r2_key` (`teacher/drawings/<gestureId>/<step>/<uuid>`), `content_type`, `size`, `width`, `height`, `credit` (text, at most 120), `updated_by`, `updated_at`; unique (gesture, step). Drawings are language-neutral.
4. **Lessons:** `lesson` (`id`, `author_id`, `number` nullable integer, `version` integer bumped on every change, `created_at`, `updated_at`); `lesson_translation` (`lesson_id`, `locale`, `title`, `notes`); `lesson_section` (`id`, `lesson_id`, `position`) with `lesson_section_translation` (`section_id`, `locale`, `title`); `lesson_item` (`lesson_id`, `section_id` nullable, `gesture_id`, `position`; unique (lesson, gesture)). A gesture that is later unpublished stays in the lesson (shown as unavailable and skipped in the PDF with a warning).
5. **Audit kinds** (the closed enum is rebuilt, like migration 0023): `teacher.info_save`, `teacher.drawing_upload`, `teacher.drawing_delete`, `lesson.create`, `lesson.update`, `lesson.delete`, `lesson.duplicate`, `lesson.export` (a count, never the PDF), target types `lesson` and `gesture_teacher_info`.
6. **PDF cache** (no table): R2 objects `teacher/pdf/<lessonId>/<version>-<template>-<locale>.pdf`, created on the first export of a lesson version, removed when the lesson changes, is deleted or by the daily retention sweep after 30 days.

## 5. Behaviour
### 5.1 Teacher info editing (the "Teacher info" tab)
- On the gesture editor (`/admin/gestures/$id`) a tab per language (phase 10b) gains a "Teacher info" panel with the six text fields (HC, PL, OR, BW, note, summary; C is the keyword list already on the tab, with the private C note beside it) and the drawing card (step 1, step 2, credit). The source (default language) text sits beside each translation.
- **Who writes what:** a teacher or an admin writes any language; a translator writes only non-default languages (they translate, they do not author); nobody else. Every save is one batch with its audit entry and a stale-lock (`CONFLICT` offers use-theirs / save-mine, as in 10b).
- The panel and the data are invisible to everyone without the teacher, translator or admin role; for a translator the drawing card is read-only.

### 5.2 Drawings
- Upload follows the audio and logo flows: `teacher.uploadDrawing` (teacher or admin) issues a presigned PUT (or the signed same-origin fallback), a finalize step verifies **PNG, JPEG or WebP by magic bytes**, at most 1 MiB and 2,000 px on a side (the PDF embeds it as is), and replaces an earlier file.
- **Private serving:** `GET /api/teacher/drawings/<gestureId>/<step>` answers only a signed-in teacher or admin (`Cache-Control: private, max-age=300`, `nosniff`, the sandbox CSP), never public and never in a CDN cache. No signed public URL exists.
- The credit line is printed under the drawing in the participants' PDF (small, like the copyright mark in the reference).

### 5.3 Lessons (the "Lessons" group in the admin sidebar, teacher and admin)
- **List:** every lesson (title in the viewer's language with fallback, number, author, gestures count, updated); search, "mine" filter; duplicate; delete (author or admin, audited, confirm dialog).
- **Builder:** a lesson page with the title, number and notes per language tabs, sections (add, rename, reorder), and a gesture picker (the existing search palette in "pick" mode with the category filter; multi-select; a gesture appears once) with drag-and-drop ordering (dnd-kit, keyboard accessible) between and inside sections; autosave with the stale-lock (`CONFLICT` shows the other editor's version); a readiness bar per language ("12 of 14 gestures have teacher info in fr").
- **Edit rights:** the author and admins edit; other teachers read, duplicate, and export (the owner's "all teachers see all lessons").
- **Export dialog:** template (for teachers / for participants), language (an enabled language; the default is the viewer's), a preview of what is missing in that language (gestures falling back to nl are marked), then **Download PDF**.

### 5.4 The PDF
- **Engine:** `pdf-lib` with `@pdf-lib/fontkit` (pure JS, runs on workerd; loaded only by the export route chunk, never by the client bundle) generating on demand in the Worker; **Figtree** (regular and bold TTF, bundled as binary assets) and the SMOG&CO logo (the brand PNG) embedded; limits: 150 gestures per lesson for the teachers' template and 80 with drawings for the participants' template (a clear error beyond it, "split the lesson"), a 25-second budget; a per-user rate limit (the existing limiter binding with a `lesson-pdf:<userId>` key, no new binding).
- **Layout (from the references):** A4 portrait, header with the logo and "SMOG" plus the title (`Les <number>` when a number is set), a two-column bordered table (left 38 %, right 62 %), rows never split across pages, a repeated header, page numbers centred in the footer, section titles as full-width shaded rows, the lesson notes above the table. **Teachers:** the word (bold, 14 pt) on the left; on the right the label column (HC, PL, OR, BW, C, 9 pt) and the text, HC in bold, C upper-cased keywords plus the C note, then the free note in brackets. **Participants:** the word (bold) and the drawing(s) (scaled to fit, "1" and "2" markers for two steps, the credit below) on the left; on the right the summary (or HC when no summary) as bullets and the `C:` line. A gesture without a translation in the chosen language prints its default-language text (grey, with a dagger and a footnote "shown in Dutch").
- **Accessibility and metadata:** document title, language and author set; fonts embedded; real text (not images) for everything except the drawings; the drawings carry the word as their alternative text where the library allows (tagged PDF is out of scope, recorded as a limitation).
- **Caching:** the first export of a (version, template, language) stores the file in R2; later exports stream it; any change to the lesson or to teacher info of a contained gesture bumps `lesson.version` (a gesture edit bumps every lesson containing it, by a version counter on `gesture_teacher_info` compared at export time), so a stale file is never served.
- **Serving:** `GET /api/teacher/lessons/<lessonId>/pdf?template=&locale=` (teacher or admin; `Content-Disposition: attachment; filename="les-<number>-<locale>.pdf"`, `private, no-store`), audited as `lesson.export` (counts only).

### 5.5 Mobile (read and share)
A teacher sees "Lessons" in the account area: the list, a lesson's gestures (read only), and **Export** (template and language) which downloads the PDF through the same route and opens the share sheet (`expo-sharing`, already present). No builder, no teacher-info editing on mobile.

## 6. Security and privacy
- Teacher information and drawings are the sensitive new asset (private teaching material, third-party copyright on the drawings). **They are served only to the teacher and admin roles**, by explicit procedures (`teacher.*`) that each carry a role guard and an authz-table row (`packages/api/test/authz.test.ts`), plus a test that no public output schema, search index or sitemap contains a teacher field or drawing key.
- Role model: `teacher` reads and writes the teaching material and lessons; `translator` writes only non-default teacher-info translations; `admin` all; a banned user has no role effect (as today).
- Uploads: magic bytes, size and pixel caps, server-chosen keys, no filename trusted; the PDF route validates the template and locale (enabled languages only) and the lesson id (UUID).
- The PDF is generated from validated text only (no HTML), so no injection surface; fonts and logo come from the bundle.
- The export is rate limited and bounded (gestures count, time budget) because generation is CPU work.
- Audit: every write and every export, with counts and ids, never text.
- **Copyright:** the drawings carry third-party copyright (the "©" in the reference). The owner supplies or licenses them; the credit field is printed, and `docs/LEGAL-SIGNOFF.md` gains an item that the owner holds the rights to every uploaded drawing.

## 7. Risks and open points
- **R1 PDF generation in a Worker.** CPU limit and memory: bounded by the caps above; if staging shows timeouts, the fallback is generating in the teacher's browser (the same code runs client-side; a decision then, not now).
- **R2 Bundle size.** `pdf-lib`, fontkit and two fonts add roughly 0.7 MB to the Worker (limit 10 MB gzip on paid plans, currently about 2.1 MB gzip): recorded and measured in the first task; none of it reaches a client entry.
- **R3 PDF accessibility.** Not a tagged PDF; limitation recorded (the HTML lesson view in the app is the accessible form).
- **R4 Layout fidelity.** The Word layout is imitated, not reproduced pixel for pixel; the owner reviews a sample PDF on staging before the templates are called done.
- **R5 Data entry.** About 75 gestures times five long fields times languages; the import/export of the translation admin does not cover teacher info in this phase (a CSV import of HC/PL/OR/BW/C is a natural follow-up, recorded).
- **R6 Migration.** One audit-enum table rebuild (the pattern of 0023) and new tables only; no data copy.

## 8. Implementation outline (the plan follows after approval)
1. Data: migrations (teacher info, drawings, lessons, audit kinds), schema, row helpers, the public-output guard test.
2. Teacher info API and the "Teacher info" tab (roles, stale-lock, translators' limits, audit).
3. Drawings: upload, verify, private route, the card in the editor.
4. Lessons API and the list/builder UI (sections, picker, ordering, autosave, readiness bar).
5. The PDF engine, the two templates, the export route, caching and the export dialog; a sample on staging for the owner's review.
6. Mobile: lessons list, lesson view, export and share.
7. Close: docs, owner list (drawings rights, enter the teacher info, review the sample PDF), whole-phase review and fix wave.

## 9. Out of scope
Tagged (accessible) PDFs, a student-facing lesson view, lesson scheduling or classes, CSV import of teacher info, per-language drawings, editing lessons on mobile.
