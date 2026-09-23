"use client";

import { SPONSORSHIP_STATUSES } from "@smog/config";
import {
  Button,
  CategoryFilter,
  GestureCard,
  GestureGrid,
  type GestureSummary,
  SearchBar,
  StatusBadge,
  VideoPlayer,
} from "@smog/ui-web";
import { useState } from "react";
import {
  categoryFixtures,
  gestureFixtures,
  SEED_PLAYBACK_ID,
} from "@/seed/fixtures";
import { Note, Section, Specimen } from "./Section";

/**
 * The real seed fixtures, flattened to what the components take.
 *
 * Nothing here fetches — the library forbids it and this page has no reason
 * to — but the content is the same Dutch vocabulary the local database gets
 * seeded with, including the deliberately long name, so the layouts are being
 * reviewed against the strings they will actually hold.
 */
const CATEGORIES = categoryFixtures.map((category) => ({
  id: category.name.toLowerCase(),
  name: category.name,
}));

const GESTURES: GestureSummary[] = gestureFixtures.map((fixture) => ({
  id: fixture.name.toLowerCase(),
  name: fixture.name,
  categories: fixture.categories.map((name) => ({
    id: name.toLowerCase(),
    name,
  })),
  playbackId: fixture.playbackId,
}));

const LONG_NAME = "Aangenaam kennis met je te maken";

const LONG_GESTURE: GestureSummary =
  GESTURES.find((gesture) => gesture.name === LONG_NAME) ?? GESTURES[0];

const SHORT_GESTURE: GestureSummary =
  GESTURES.find((gesture) => gesture.name === "Rood") ?? GESTURES[0];

/** The gesture filed under two categories, so the badge row has to wrap. */
const MULTI_CATEGORY_GESTURE: GestureSummary = {
  ...LONG_GESTURE,
  id: "multi-category",
  categories: CATEGORIES,
};

/**
 * Every sponsorship status, read from `@smog/config` rather than listed here,
 * plus one value that is not a status at all — the fallback a badge takes
 * when a page hands it something the enum has never heard of.
 */
const STATUSES: string[] = [...SPONSORSHIP_STATUSES, "iets-onbekends"];

export function DomainSection() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(["begroetingen"]);
  const [favorites, setFavorites] = useState<string[]>([LONG_GESTURE.id]);

  const toggleFavorite = (id: string) =>
    setFavorites((previous) =>
      previous.includes(id)
        ? previous.filter((current) => current !== id)
        : [...previous, id]
    );

  return (
    <Section id="domain" title="Domain components">
      <Note>
        The content is <code>src/seed/fixtures.ts</code>, unchanged — the same
        33 gestures the local database gets, including the long one that exists
        to break card layouts.
      </Note>

      <Specimen className="block w-full" label="SearchBar">
        <div className="flex w-full max-w-md flex-col gap-2">
          <SearchBar onSearch={setQuery} placeholder="Zoek een gebaar" />
          <p className="text-foreground-muted text-sm">
            Laatste zoekopdracht: {query === "" ? "(leeg)" : query}
          </p>
        </div>
      </Specimen>

      <Specimen className="block w-full" label="CategoryFilter">
        <CategoryFilter
          categories={CATEGORIES}
          onChange={setSelected}
          selectedIds={selected}
        />
      </Specimen>

      <Specimen label="StatusBadge — every sponsorship status, plus an unknown one">
        {STATUSES.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </Specimen>

      <Specimen
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
        label="GestureCard — short name, long name, two categories, favourited, linked"
      >
        <GestureCard gesture={SHORT_GESTURE} />
        <GestureCard gesture={LONG_GESTURE} />
        <GestureCard gesture={MULTI_CATEGORY_GESTURE} />
        <GestureCard
          gesture={LONG_GESTURE}
          isFavorite={favorites.includes(LONG_GESTURE.id)}
          onFavorite={toggleFavorite}
        />
        <GestureCard
          gesture={SHORT_GESTURE}
          renderLink={(children) => <a href="#domain">{children}</a>}
        />
        <GestureCard gesture={{ id: "bare", name: "Zonder categorieën" }} />
      </Specimen>

      {/*
       * The overflow probe. jsdom computes no layout, so a unit test can only
       * assert that `truncate`, `min-w-0` and `overflow-hidden` are on the
       * right elements. This column is 180px wide and holds the longest name
       * in the fixtures; whether the card clips or is pushed open is a
       * question only a real browser answers, and the e2e spec measures it
       * here by id.
       */}
      <Specimen
        className="block w-full"
        label="GestureCard in a 180px column — the truncation probe"
      >
        <div
          className="w-[180px] rounded-lg border border-border-strong border-dashed p-2"
          data-testid="overflow-probe"
        >
          <GestureCard
            data-testid="overflow-card"
            gesture={MULTI_CATEGORY_GESTURE}
            onFavorite={toggleFavorite}
          />
        </div>
      </Specimen>

      <Specimen className="block w-full" label="GestureGrid — loaded">
        <GestureGrid
          favoriteIds={favorites}
          gestures={GESTURES.slice(0, 6)}
          onFavorite={toggleFavorite}
          renderGestureLink={(gesture, children) => (
            <a href={`#${gesture.id}`}>{children}</a>
          )}
        />
      </Specimen>

      <Specimen className="block w-full" label="GestureGrid — loading">
        <GestureGrid gestures={[]} loading skeletonCount={3} />
      </Specimen>

      <Specimen className="block w-full" label="GestureGrid — empty">
        <GestureGrid
          emptyAction={
            <Button onClick={() => setSelected([])} size="sm">
              Filters wissen
            </Button>
          }
          emptyDescription="Pas je zoekopdracht aan of kies een andere categorie."
          gestures={[]}
        />
      </Specimen>

      <Specimen
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
        label="VideoPlayer — with a playback id, and without one"
      >
        <div data-testid="video-with-id">
          <VideoPlayer playbackId={SEED_PLAYBACK_ID} title={LONG_NAME} />
        </div>
        <div data-testid="video-without-id">
          <VideoPlayer playbackId={null} title="Nog in verwerking" />
        </div>
      </Specimen>
    </Section>
  );
}
