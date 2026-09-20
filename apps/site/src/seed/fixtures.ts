/**
 * Representative development content for Stages 2 through 5.
 *
 * This is *not* the Stage 9 production migration from Convex. It exists so the
 * design system, the public site and the sponsor flow have something honest to
 * render against: real Flemish/Dutch SMOG vocabulary, names of wildly
 * different lengths, gestures in more than one category, one deactivated
 * gesture, and enough documents that a list view actually paginates.
 *
 * Localization follows the spec: Dutch (`nl`) is the source of truth, `en` and
 * `fr` are optional. Some fixtures carry translations and some deliberately do
 * not, so Stage 2 meets locale fallback here rather than discovering it in
 * production.
 */

/** The locales that may appear in a fixture's `translations`. `nl` is the base. */
export type TranslatedLocale = "en" | "fr";

export interface CategoryFixture {
  /** Dutch name. The seed upserts on this, so it must be unique. */
  name: string;
  translations?: Partial<Record<TranslatedLocale, { name: string }>>;
}

export interface GestureFixture {
  /** Dutch name. The seed upserts on this, so it must be unique. */
  name: string;
  /** Names of `categoryFixtures` entries, resolved to IDs by the seed. */
  categories: string[];
  playbackId: string;
  concepts: string[];
  info?: string;
  isActive?: boolean;
  translations?: Partial<
    Record<
      TranslatedLocale,
      { name?: string; concepts?: string[]; info?: string }
    >
  >;
}

/**
 * Mux's public sample asset, used throughout Mux's own documentation, so a
 * seeded gesture plays a real video locally instead of erroring on a dead id.
 *
 * The plan asked for "a real Mux playback ID from the existing production
 * data". No production playback id exists anywhere in this repository — they
 * live in Convex — and hard-coding one from the live product into a committed
 * fixture would publish a customer's video id. When Stage 9 brings the real
 * data across, swapping this one constant is the whole change.
 */
export const SEED_PLAYBACK_ID =
  "qxb01i6T202018GFS02vp9RIe01icTcDCjVzQpmaB00CUisJ4";

export const categoryFixtures: CategoryFixture[] = [
  {
    name: "Begroetingen",
    translations: { en: { name: "Greetings" }, fr: { name: "Salutations" } },
  },
  {
    name: "Familie",
    translations: { en: { name: "Family" }, fr: { name: "Famille" } },
  },
  {
    name: "Eten en drinken",
    translations: {
      en: { name: "Food and drink" },
      fr: { name: "Nourriture et boissons" },
    },
  },
  {
    name: "Getallen",
    translations: { en: { name: "Numbers" }, fr: { name: "Nombres" } },
  },
  {
    name: "Kleuren",
    translations: { en: { name: "Colours" }, fr: { name: "Couleurs" } },
  },
];

/** Every fixture shares one playback id; spelling it out 30 times invites drift. */
const gesture = (
  fixture: Omit<GestureFixture, "playbackId">
): GestureFixture => ({
  ...fixture,
  playbackId: SEED_PLAYBACK_ID,
});

export const gestureFixtures: GestureFixture[] = [
  gesture({
    name: "Hallo",
    categories: ["Begroetingen"],
    concepts: ["hoi", "dag", "hey"],
    info: "Open hand ter hoogte van het hoofd, korte zwaaibeweging.",
    translations: {
      en: {
        name: "Hello",
        concepts: ["hi", "hey"],
        info: "Open hand at head height, short wave.",
      },
      fr: { name: "Bonjour", concepts: ["salut"] },
    },
  }),
  gesture({
    name: "Dag",
    categories: ["Begroetingen"],
    concepts: ["tot ziens", "doei", "vaarwel"],
    translations: {
      en: { name: "Goodbye", concepts: ["bye", "see you"] },
      fr: { name: "Au revoir", concepts: ["salut"] },
    },
  }),
  gesture({
    name: "Goedemorgen",
    categories: ["Begroetingen"],
    concepts: ["goeiemorgen", "morgen"],
    translations: { en: { name: "Good morning" } },
  }),
  gesture({
    name: "Dank je wel",
    categories: ["Begroetingen"],
    concepts: ["bedankt", "dankjewel", "merci"],
    info: "Vlakke hand van de kin naar voren bewegen.",
    translations: {
      en: { name: "Thank you", concepts: ["thanks"] },
      fr: { name: "Merci" },
    },
  }),
  gesture({
    name: "Alsjeblieft",
    categories: ["Begroetingen"],
    concepts: ["alstublieft", "graag gedaan"],
  }),
  gesture({
    name: "Sorry",
    categories: ["Begroetingen"],
    concepts: ["het spijt me", "excuses"],
    translations: { en: { name: "Sorry", concepts: ["excuse me"] } },
  }),
  // The long one. Card layouts that only ever hold "Rood" hide every wrapping
  // and truncation bug until the design is already shipped.
  gesture({
    name: "Aangenaam kennis met je te maken",
    categories: ["Begroetingen"],
    concepts: ["aangenaam", "leuk je te ontmoeten", "kennismaking"],
    info: "Twee gebaren na elkaar: eerst 'aangenaam', dan 'kennismaken'.",
    translations: {
      en: { name: "Pleased to meet you", concepts: ["nice to meet you"] },
      fr: { name: "Enchanté de faire votre connaissance" },
    },
  }),
  gesture({
    name: "Mama",
    categories: ["Familie"],
    concepts: ["moeder", "mam", "mams"],
    translations: { en: { name: "Mum", concepts: ["mother", "mom"] } },
  }),
  gesture({
    name: "Papa",
    categories: ["Familie"],
    concepts: ["vader", "pap", "paps"],
    translations: { en: { name: "Dad", concepts: ["father"] } },
  }),
  gesture({
    name: "Oma",
    categories: ["Familie"],
    concepts: ["grootmoeder", "bomma", "omaatje"],
  }),
  gesture({
    name: "Opa",
    categories: ["Familie"],
    concepts: ["grootvader", "bompa"],
  }),
  gesture({
    name: "Zus",
    categories: ["Familie"],
    concepts: ["zusje", "zuster"],
  }),
  gesture({
    name: "Broer",
    categories: ["Familie"],
    concepts: ["broertje"],
  }),
  gesture({
    name: "Baby",
    categories: ["Familie"],
    concepts: ["kindje", "kleintje", "zuigeling"],
    translations: { fr: { name: "Bébé", concepts: ["nourrisson"] } },
  }),
  gesture({
    name: "Eten",
    categories: ["Eten en drinken"],
    concepts: ["maaltijd", "smullen", "happen"],
    info: "Toppen van de vingers herhaald naar de mond brengen.",
    translations: {
      en: { name: "To eat", concepts: ["food", "meal"] },
      fr: { name: "Manger", concepts: ["repas"] },
    },
  }),
  gesture({
    name: "Drinken",
    categories: ["Eten en drinken"],
    concepts: ["slurpen", "dorst"],
    translations: { en: { name: "To drink", concepts: ["thirsty"] } },
  }),
  gesture({
    name: "Water",
    categories: ["Eten en drinken"],
    concepts: ["kraantjeswater", "drinkwater"],
    translations: { fr: { name: "Eau" } },
  }),
  gesture({
    name: "Melk",
    categories: ["Eten en drinken"],
    concepts: ["melkje", "zuivel"],
  }),
  gesture({
    name: "Brood",
    categories: ["Eten en drinken"],
    concepts: ["boterham", "snee brood"],
  }),
  gesture({
    name: "Appel",
    categories: ["Eten en drinken"],
    concepts: ["fruit", "appeltje"],
    translations: { en: { name: "Apple" } },
  }),
  gesture({
    name: "Koekje",
    categories: ["Eten en drinken"],
    concepts: ["biscuit", "keksje"],
  }),
  // Deactivated on purpose: `publicReadActive` must hide this from anonymous
  // callers and from the public search index, and there has to be something
  // in the database for that to be visible at all.
  gesture({
    name: "Snoepje",
    categories: ["Eten en drinken"],
    concepts: ["snoep", "zoetigheid"],
    info: "Opname wacht op herziening; niet zichtbaar voor bezoekers.",
    isActive: false,
  }),
  // Genuinely both a colour and a fruit, so `categories` has a fixture with
  // more than one relationship without inventing a nonsense pairing.
  gesture({
    name: "Oranje",
    categories: ["Kleuren", "Eten en drinken"],
    concepts: ["sinaasappel", "oranjekleurig"],
    translations: { en: { name: "Orange", concepts: ["orange fruit"] } },
  }),
  gesture({
    name: "Een",
    categories: ["Getallen"],
    concepts: ["1", "eentje"],
    translations: { en: { name: "One", concepts: ["1"] } },
  }),
  gesture({
    name: "Twee",
    categories: ["Getallen"],
    concepts: ["2", "tweetje"],
  }),
  gesture({
    name: "Drie",
    categories: ["Getallen"],
    concepts: ["3"],
  }),
  gesture({
    name: "Vier",
    categories: ["Getallen"],
    concepts: ["4"],
  }),
  gesture({
    name: "Vijf",
    categories: ["Getallen"],
    concepts: ["5", "hand"],
  }),
  gesture({
    name: "Rood",
    categories: ["Kleuren"],
    concepts: ["rode kleur"],
    translations: { en: { name: "Red" }, fr: { name: "Rouge" } },
  }),
  gesture({
    name: "Blauw",
    categories: ["Kleuren"],
    concepts: ["blauwe kleur"],
    translations: { fr: { name: "Bleu" } },
  }),
  gesture({
    name: "Geel",
    categories: ["Kleuren"],
    concepts: ["gele kleur"],
  }),
  gesture({
    name: "Groen",
    categories: ["Kleuren"],
    concepts: ["groene kleur"],
  }),
  gesture({
    name: "Zwart",
    categories: ["Kleuren"],
    concepts: ["zwarte kleur", "donker"],
  }),
];
