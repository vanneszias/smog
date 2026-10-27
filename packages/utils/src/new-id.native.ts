import { randomUUID } from "expo-crypto";

/** Hermes has no global Web Crypto; Metro selects this implementation. */
export function newId(): string {
  return randomUUID();
}
