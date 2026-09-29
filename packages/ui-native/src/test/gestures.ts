import type { GestureCardData } from "../domain/types";

/** Gestures for the domain component tests (the shape of `GestureSummary`). */
export const HELLO: GestureCardData = {
  categories: [
    { name: "Greetings", slug: "greetings" },
    { name: "Everyday", slug: "everyday" },
  ],
  id: "g1",
  name: "Hello",
  playbackId: "mux-hello",
  slug: "hello",
};

export const EAT: GestureCardData = {
  categories: [{ name: "Food", slug: "food" }],
  id: "g2",
  name: "Eat",
  playbackId: "mux-eat",
  slug: "eat",
};
