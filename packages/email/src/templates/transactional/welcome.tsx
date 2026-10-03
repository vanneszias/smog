import { stubTemplate } from "./stub";

export interface WelcomeProps {
  /** The account's name, or `null`. */
  name: string | null;
  /** The site (`SITE_URL`). */
  url: string;
}

/**
 * `welcome` (E-01): sent once per account when its email becomes verified (`welcome:<userId>`).
 * A stub until phase 6 task 2 designs it.
 */
export const welcome = stubTemplate<WelcomeProps>("welcome");
