import { getRandomBytes } from "expo-crypto";
import type { Id } from "@/convex/_generated/dataModel";
import type { Gesture } from "@/types";

export const generateGuestId = (): string => {
  const randomBytes = getRandomBytes(16);
  const hexString = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `guest_${hexString}`;
};

export const convertConvexGestureToLocal = (convexGesture: {
  _id: Id<"gestures">;
  _creationTime: number;
  name: string;
  categoryIds: Id<"categories">[];
  playbackId: string;
  concept: string[];
  info: string;
  isActive: boolean;
  lastUpdated: number;
}): Gesture => ({
  id: convexGesture._id,
  name: convexGesture.name,
  category: convexGesture.categoryIds.map((id) => id.toString()),
  playbackId: convexGesture.playbackId,
  concept: convexGesture.concept,
  info: convexGesture.info,
});
