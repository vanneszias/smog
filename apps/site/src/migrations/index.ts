import * as migration_20250929_111647 from "./20250929_111647";
import * as migration_20260919_174541_add_categories from "./20260919_174541_add_categories";

export const migrations = [
  {
    up: migration_20250929_111647.up,
    down: migration_20250929_111647.down,
    name: "20250929_111647",
  },
  {
    up: migration_20260919_174541_add_categories.up,
    down: migration_20260919_174541_add_categories.down,
    name: "20260919_174541_add_categories",
  },
];
