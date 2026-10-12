import { produce } from "./ops";
import type { RatingNote } from "./schema";

/**
 * Undo history as one immutable value. Every transition is a pure function, so React may call
 * the updaters as often as it likes (StrictMode calls them twice) without duplicating states.
 */
export interface History {
  past: RatingNote[];
  present: RatingNote;
  future: RatingNote[];
}

const LIMIT = 80;

export const initHistory = (present: RatingNote): History => ({ past: [], present, future: [] });

/** Applies an edit. `checkpoint` decides whether the previous state becomes an undo step. */
export function edit(h: History, fn: (draft: RatingNote) => void, checkpoint: boolean): History {
  return {
    past: checkpoint ? [...h.past.slice(-LIMIT), h.present] : h.past,
    present: produce(h.present, fn),
    future: checkpoint ? [] : h.future,
  };
}

/** Replaces the whole note (generate, open, load sample) as one undoable step. */
export function replace(h: History, next: RatingNote): History {
  return { past: [...h.past.slice(-LIMIT), h.present], present: next, future: [] };
}

export function undo(h: History): History {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  if (!h.future.length) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next, future: rest };
}
