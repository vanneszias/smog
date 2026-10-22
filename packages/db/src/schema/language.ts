/**
 * Languages are data (phase 10b, migration 0015): `nl`, `en` and `fr` are
 * seeded, an admin adds more. The `locale` columns of `user` and `sponsor`
 * (and every translation table) reference `language.code`, which replaces
 * the CHECK that hard-coded the three locales.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { col, lengthBetween } from "./columns";

export const language = sqliteTable(
  "language",
  {
    /** A BCP-47 language tag, the way the cookie and the APIs name it (`nl`, `fr`, `pt-BR`). */
    code: text("code").primaryKey(),
    /** The language's own name ("Nederlands"), shown in the language menu. */
    name: text("name").notNull(),
    /** What `Intl` formats dates and lists with (`nl-BE`). */
    intlTag: text("intl_tag").notNull(),
    /** A disabled language is hidden from the menu; its data is kept. */
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    /** Exactly one row: the language the base columns (`gesture.name`, ...) are written in. */
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    check("language_code_length_check", lengthBetween(t.code, 2, 35)),
    check("language_name_length_check", lengthBetween(t.name, 1, 80)),
    check("language_intl_tag_length_check", lengthBetween(t.intlTag, 2, 35)),
    check(
      "language_default_enabled_check",
      sql`NOT (${col(t.isDefault)} = 1 AND ${col(t.enabled)} = 0)`
    ),
    // At most one default; migration 0015 seeds it and a trigger refuses to
    // delete it, so there is exactly one.
    uniqueIndex("language_default_uq")
      .on(t.isDefault)
      .where(sql`${col(t.isDefault)} = 1`),
    // The language menu: enabled languages in order.
    index("language_menu_idx").on(t.enabled, t.sortOrder, t.code),
  ]
);
