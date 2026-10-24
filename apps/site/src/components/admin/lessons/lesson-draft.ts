import {
  LESSON_MAX_GESTURES,
  LESSON_MAX_SECTIONS,
  type LessonDetail,
  type LessonItem,
  type LessonSection,
  type LessonUpdateInput,
} from "@smog/lessons/schema";

/**
 * The lesson as the builder edits it (phase 10c task 4): the stored
 * `LessonDetail` without its identity and rights, as plain values the
 * operations below replace and never mutate. `toInput` is what autosave sends.
 */
export interface LessonDraft {
  number: number | null;
  sections: LessonSection[];
  translations: Record<string, { notes: string; title: string }>;
  ungrouped: LessonItem[];
}

/** The section a gesture sits in; `null` is the part before the first section. */
export type SectionRef = string | null;

export function draftOf(lesson: LessonDetail): LessonDraft {
  return {
    number: lesson.number,
    sections: lesson.sections,
    translations: lesson.translations,
    ungrouped: lesson.ungrouped,
  };
}

/** What `lessons.update` takes for `draft`, locked to `expectedVersion`. */
export function toInput(
  id: string,
  expectedVersion: number,
  draft: LessonDraft
): LessonUpdateInput {
  return {
    expectedVersion,
    id,
    number: draft.number,
    sections: draft.sections.map((section) => ({
      gestureIds: section.items.map((item) => item.id),
      id: section.id,
      titles: section.titles,
    })),
    translations: draft.translations,
    ungrouped: draft.ungrouped.map((item) => item.id),
  };
}

/** Every gesture of the draft in order: the ungrouped first, then each section's. */
export function allItems(draft: LessonDraft): LessonItem[] {
  return [
    ...draft.ungrouped,
    ...draft.sections.flatMap((section) => section.items),
  ];
}

export function gestureCount(draft: LessonDraft): number {
  return allItems(draft).length;
}

/** Whether another gesture fits (a lesson holds at most `LESSON_MAX_GESTURES`). */
export function hasRoom(draft: LessonDraft): boolean {
  return gestureCount(draft) < LESSON_MAX_GESTURES;
}

export function canAddSection(draft: LessonDraft): boolean {
  return draft.sections.length < LESSON_MAX_SECTIONS;
}

/** What stops a save: no title anywhere, or notes in a language with no title. */
export type DraftProblem = "noTitle" | "notesWithoutTitle";

export function problemOf(draft: LessonDraft): DraftProblem | null {
  const texts = Object.values(draft.translations);
  if (texts.some((text) => text.title.trim() === "" && text.notes !== "")) {
    return "notesWithoutTitle";
  }
  return texts.some((text) => text.title.trim() !== "") ? null : "noTitle";
}

/** Appends `items` (those not already in the lesson) to a section, or to the ungrouped part. */
export function addItems(
  draft: LessonDraft,
  items: readonly LessonItem[],
  to: SectionRef
): LessonDraft {
  const held = new Set(allItems(draft).map((item) => item.id));
  const room = LESSON_MAX_GESTURES - held.size;
  const fresh = items.filter((item) => !held.has(item.id)).slice(0, room);
  if (fresh.length === 0) {
    return draft;
  }
  if (to === null) {
    return { ...draft, ungrouped: [...draft.ungrouped, ...fresh] };
  }
  return {
    ...draft,
    sections: draft.sections.map((section) =>
      section.id === to
        ? { ...section, items: [...section.items, ...fresh] }
        : section
    ),
  };
}

/** Removes the gesture wherever it is. */
export function removeItem(draft: LessonDraft, gestureId: string): LessonDraft {
  const keep = (item: LessonItem): boolean => item.id !== gestureId;
  return {
    ...draft,
    sections: draft.sections.map((section) => ({
      ...section,
      items: section.items.filter(keep),
    })),
    ungrouped: draft.ungrouped.filter(keep),
  };
}

/** Puts a section's (or the ungrouped part's) gestures in the order of `ids`; unknown ids are ignored. */
export function reorderItems(
  draft: LessonDraft,
  within: SectionRef,
  ids: readonly string[]
): LessonDraft {
  const order = (items: readonly LessonItem[]): LessonItem[] => {
    const byId = new Map(items.map((item) => [item.id, item]));
    const ordered = ids.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    });
    // Anything the order did not name keeps its place at the end.
    const named = new Set(ordered.map((item) => item.id));
    return [...ordered, ...items.filter((item) => !named.has(item.id))];
  };
  if (within === null) {
    return { ...draft, ungrouped: order(draft.ungrouped) };
  }
  return {
    ...draft,
    sections: draft.sections.map((section) =>
      section.id === within
        ? { ...section, items: order(section.items) }
        : section
    ),
  };
}

/** Moves a gesture to the end of another section (or the ungrouped part). */
export function moveItem(
  draft: LessonDraft,
  gestureId: string,
  to: SectionRef
): LessonDraft {
  const item = allItems(draft).find((candidate) => candidate.id === gestureId);
  return item ? addItems(removeItem(draft, gestureId), [item], to) : draft;
}

/** Where a gesture sits now. */
export function sectionOf(
  draft: LessonDraft,
  gestureId: string
): SectionRef | undefined {
  if (draft.ungrouped.some((item) => item.id === gestureId)) {
    return null;
  }
  return draft.sections.find((section) =>
    section.items.some((item) => item.id === gestureId)
  )?.id;
}

/** Appends an empty section (its id is made by the caller: a UUID). */
export function addSection(
  draft: LessonDraft,
  id: string,
  titles: Record<string, string>
): LessonDraft {
  if (!canAddSection(draft)) {
    return draft;
  }
  return {
    ...draft,
    sections: [...draft.sections, { id, items: [], titles }],
  };
}

/** Sets a section's title in one language (an empty title removes that language). */
export function renameSection(
  draft: LessonDraft,
  id: string,
  locale: string,
  title: string
): LessonDraft {
  return {
    ...draft,
    sections: draft.sections.map((section) => {
      if (section.id !== id) {
        return section;
      }
      const { [locale]: _removed, ...rest } = section.titles;
      return {
        ...section,
        titles: title === "" ? rest : { ...rest, [locale]: title },
      };
    }),
  };
}

/** Removes a section; its gestures move to the end of the part before it (or to the ungrouped part). */
export function removeSection(draft: LessonDraft, id: string): LessonDraft {
  const at = draft.sections.findIndex((section) => section.id === id);
  const removed = draft.sections[at];
  if (!removed) {
    return draft;
  }
  const rest = draft.sections.filter((section) => section.id !== id);
  const before = rest[at - 1];
  if (!before) {
    return {
      ...draft,
      sections: rest,
      ungrouped: [...draft.ungrouped, ...removed.items],
    };
  }
  return {
    ...draft,
    sections: rest.map((section) =>
      section.id === before.id
        ? { ...section, items: [...section.items, ...removed.items] }
        : section
    ),
  };
}

/** Puts the sections in the order of `ids`. */
export function reorderSections(
  draft: LessonDraft,
  ids: readonly string[]
): LessonDraft {
  const byId = new Map(draft.sections.map((section) => [section.id, section]));
  const ordered = ids.flatMap((id) => {
    const section = byId.get(id);
    return section ? [section] : [];
  });
  const named = new Set(ordered.map((section) => section.id));
  return {
    ...draft,
    sections: [
      ...ordered,
      ...draft.sections.filter((section) => !named.has(section.id)),
    ],
  };
}

/** Sets the title or the notes of one language. */
export function setText(
  draft: LessonDraft,
  locale: string,
  part: "notes" | "title",
  value: string
): LessonDraft {
  const current = draft.translations[locale] ?? { notes: "", title: "" };
  return {
    ...draft,
    translations: {
      ...draft.translations,
      [locale]: { ...current, [part]: value },
    },
  };
}

export function setNumber(
  draft: LessonDraft,
  number: number | null
): LessonDraft {
  return { ...draft, number };
}

/** Whether two drafts hold the same lesson. */
export function sameDraft(a: LessonDraft, b: LessonDraft): boolean {
  return JSON.stringify(normal(a)) === JSON.stringify(normal(b));
}

function normal(draft: LessonDraft): unknown {
  const texts = Object.entries(draft.translations)
    .filter(([, text]) => text.title.trim() !== "" || text.notes !== "")
    .sort(([x], [y]) => x.localeCompare(y));
  return [
    draft.number,
    texts,
    draft.ungrouped.map((item) => item.id),
    draft.sections.map((section) => [
      section.id,
      Object.entries(section.titles)
        .filter(([, title]) => title !== "")
        .sort(([x], [y]) => x.localeCompare(y)),
      section.items.map((item) => item.id),
    ]),
  ];
}
