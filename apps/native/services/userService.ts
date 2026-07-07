import { getRandomBytes } from "expo-crypto";

export const generateGuestId = (): string => {
  const randomBytes = getRandomBytes(16);
  const hexString = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `guest_${hexString}`;
};
