import { lessonConflictOf } from "@smog/lessons/client";
import type { LessonDetail, LessonSaved } from "@smog/lessons/schema";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type DraftProblem,
  draftOf,
  type LessonDraft,
  problemOf,
  sameDraft,
  toInput,
} from "./lesson-draft";

/** Typing pauses this long before the lesson is saved. */
const AUTOSAVE_DELAY_MS = 800;

/**
 * Where the lesson stands: `saved` (the server has this draft), `dirty` (an
 * edit waits for the pause), `saving`, `invalid` (a title is missing, so
 * nothing is sent), `error` (the save failed; the next edit or "Try again"
 * retries) and `conflict` (another editor saved first: the draft waits for a
 * choice).
 */
export type SaveStatus =
  | "conflict"
  | "dirty"
  | "error"
  | "invalid"
  | "saved"
  | "saving";

export interface Autosave {
  conflict: LessonDetail | null;
  draft: LessonDraft;
  /** Change the draft; the save follows the pause. */
  edit: (change: (draft: LessonDraft) => LessonDraft) => void;
  /** Keep the draft and save over the other editor's version. */
  keepMine: () => void;
  problem: DraftProblem | null;
  /** Save now (after an error). */
  retry: () => void;
  status: SaveStatus;
  /** Drop the draft for the other editor's version. */
  takeTheirs: () => void;
  /** The version the server holds for this draft (the lock of the next save). */
  version: number;
}

type Save = (input: ReturnType<typeof toInput>) => Promise<LessonSaved>;

/**
 * The builder's autosave (plan ruling 7, spec 5.3): edits change a local
 * draft at once, a save follows 0.8 s after the last one, one save runs at a
 * time (an edit made meanwhile is saved right after, with the version the
 * first save returned), and a save that loses to another editor stops with
 * their lesson, offered as "use theirs" or "keep mine".
 */
export function useLessonAutosave(
  lesson: LessonDetail,
  save: Save,
  delay = AUTOSAVE_DELAY_MS
): Autosave {
  const [draft, setDraft] = useState<LessonDraft>(() => draftOf(lesson));
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [version, setVersion] = useState(lesson.version);
  const [conflict, setConflict] = useState<LessonDetail | null>(null);
  const draftRef = useRef(draft);
  const savedRef = useRef(draft);
  const versionRef = useRef(lesson.version);
  const conflictRef = useRef<LessonDetail | null>(null);
  // Whether a conflict is waiting for a choice (mirrors `conflictRef`).
  const blocked = useRef<boolean>(false as boolean);
  const running = useRef<boolean>(false as boolean);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;
  const { id } = lesson;

  const flush = useCallback(async (): Promise<void> => {
    if (running.current || blocked.current) {
      return;
    }
    const sent = draftRef.current;
    if (sameDraft(sent, savedRef.current)) {
      setStatus("saved");
      return;
    }
    if (problemOf(sent)) {
      setStatus("invalid");
      return;
    }
    running.current = true;
    setStatus("saving");
    try {
      const result = await saveRef.current(
        toInput(id, versionRef.current, sent)
      );
      versionRef.current = result.version;
      setVersion(result.version);
      savedRef.current = sent;
      running.current = false;
      if (draftRef.current === sent) {
        setStatus("saved");
      } else {
        // Edited while saving: the next save goes with the version just returned.
        await flush();
      }
    } catch (error) {
      running.current = false;
      const lost = lessonConflictOf(error);
      if (lost) {
        conflictRef.current = lost.current;
        blocked.current = true;
        setConflict(lost.current);
        setStatus("conflict");
      } else {
        console.error("[lessons] Failed to save the lesson:", error);
        setStatus("error");
      }
    }
  }, [id]);

  const edit = useCallback(
    (change: (draft: LessonDraft) => LessonDraft): void => {
      const next = change(draftRef.current);
      if (next === draftRef.current) {
        return;
      }
      draftRef.current = next;
      setDraft(next);
      if (!blocked.current) {
        setStatus((now) => (now === "saving" ? now : "dirty"));
      }
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        flush().catch((error: unknown) => {
          console.error("[lessons] Failed to save the lesson:", error);
        });
      }, delay);
    },
    [delay, flush]
  );

  const retry = useCallback((): void => {
    clearTimeout(timer.current);
    flush().catch((error: unknown) => {
      console.error("[lessons] Failed to save the lesson:", error);
    });
  }, [flush]);

  const takeTheirs = useCallback((): void => {
    const theirs = conflictRef.current;
    if (!theirs) {
      return;
    }
    const next = draftOf(theirs);
    conflictRef.current = null;
    blocked.current = false;
    draftRef.current = next;
    savedRef.current = next;
    versionRef.current = theirs.version;
    setConflict(null);
    setDraft(next);
    setVersion(theirs.version);
    setStatus("saved");
  }, []);

  const keepMine = useCallback((): void => {
    const theirs = conflictRef.current;
    if (!theirs) {
      return;
    }
    conflictRef.current = null;
    blocked.current = false;
    versionRef.current = theirs.version;
    savedRef.current = draftOf(theirs);
    setConflict(null);
    setVersion(theirs.version);
    setStatus("dirty");
    flush().catch((error: unknown) => {
      console.error("[lessons] Failed to save the lesson:", error);
    });
  }, [flush]);

  // Leaving the screen with an edit still waiting for the pause saves it now.
  useEffect(
    () => () => {
      if (timer.current !== undefined) {
        clearTimeout(timer.current);
        flush().catch((error: unknown) => {
          console.error("[lessons] Failed to save the lesson:", error);
        });
      }
    },
    [flush]
  );

  return useMemo(
    () => ({
      conflict,
      draft,
      edit,
      keepMine,
      problem: problemOf(draft),
      retry,
      status,
      takeTheirs,
      version,
    }),
    [conflict, draft, edit, keepMine, retry, status, takeTheirs, version]
  );
}
