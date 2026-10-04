/**
 * The sponsorship fixtures of phase 8 task 8, beside the export's
 * `sponsorships/documents.jsonl`:
 * - `sponsorship-gestures.jsonl`: the gestures the sponsorship rows need
 *   besides `Mama` (the `gestures` table is task 7's fixture, so these
 *   rows live here until task 10 merges them into the export);
 * - `sponsorships-blockers.jsonl`: rows that block a plan (a second
 *   blocking sponsorship on a gesture, a missing gesture), kept out of the
 *   export so the fixture plan has no blocker with its overrides.
 */

export const SPONSORSHIP_GESTURES = new URL(
  "./fixtures/sponsorship-gestures.jsonl",
  import.meta.url
).pathname;

export const SPONSORSHIP_BLOCKERS = new URL(
  "./fixtures/sponsorships-blockers.jsonl",
  import.meta.url
).pathname;

/** The personal and secret values of the sponsorship rows (`FIXTURE_SECRETS`). */
export const SPONSORSHIP_SECRETS = [
  // Addresses.
  "cas.fixture@example.test",
  "dirk.fixture@example.test",
  "eva.fixture@example.test",
  "fien.fixture@example.test",
  "gust.fixture@example.test",
  "hanne.fixture@example.test",
  "ilse.fixture@example.test",
  "jef.fixture@example.test",
  "kato.fixture@example.test",
  "lien.fixture@example.test",
  "mira.fixture@example.test",
  "noor.fixture@example.test",
  // Contact and sponsor names, companies.
  "Cas Fixture",
  "Dirk Fixture",
  "Eva Fixture",
  "Fien Fixture",
  "Gust Fixture",
  "Hanne Fixture",
  "Ilse Fixture",
  "Jef Fixture",
  "Kato Fixture",
  "Lien Fixture",
  "Mira Fixture",
  "Noor Fixture",
  "Fixture Garage",
  "Slagerij Fixturelaan",
  // Overlays (the 36-character one and its override included).
  "Cas Fixturebedrijf",
  "Dirk Fixturewinkel",
  "Garage Fixture",
  "Fien Fixturezaak",
  "Gust Fixtureatelier",
  "Slagerij Fixturelaan & Kinderen BVBA",
  "Ilse Fixturehuis",
  "Jef Fixturebureau",
  "Kato Fixturekapsalon",
  "Lien Fixturebloemen",
  "Mira Fixturestudio",
  "Noor Fixturecafe",
  // The rejection reason, a VAT number, the re-edit tokens.
  "Fixture reden: logo onleesbaar",
  "BE0123456789",
  "5b0e7c1a-3f2d-4c8e-9a6b-1d2e3f4a5b6c",
  "0c7d1e2f-4a5b-4c6d-8e9f-a0b1c2d3e4f5",
] as const;
