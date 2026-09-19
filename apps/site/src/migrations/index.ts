import * as migration_20250929_111647 from "./20250929_111647";
import * as migration_20260919_174541_add_categories from "./20260919_174541_add_categories";
import * as migration_20260919_180415_add_gestures from "./20260919_180415_add_gestures";
import * as migration_20260919_183041_payload_3_90_upgrade from "./20260919_183041_payload_3_90_upgrade";
import * as migration_20260919_190548_add_user_roles from "./20260919_190548_add_user_roles";
import * as migration_20260919_193653_revert_3_90_columns from "./20260919_193653_revert_3_90_columns";
import * as migration_20260919_194626_add_user_favorites from "./20260919_194626_add_user_favorites";
import * as migration_20260919_200842_add_lists from "./20260919_200842_add_lists";

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
  {
    up: migration_20260919_180415_add_gestures.up,
    down: migration_20260919_180415_add_gestures.down,
    name: "20260919_180415_add_gestures",
  },
  {
    up: migration_20260919_183041_payload_3_90_upgrade.up,
    down: migration_20260919_183041_payload_3_90_upgrade.down,
    name: "20260919_183041_payload_3_90_upgrade",
  },
  {
    up: migration_20260919_190548_add_user_roles.up,
    down: migration_20260919_190548_add_user_roles.down,
    name: "20260919_190548_add_user_roles",
  },
  {
    up: migration_20260919_193653_revert_3_90_columns.up,
    down: migration_20260919_193653_revert_3_90_columns.down,
    name: "20260919_193653_revert_3_90_columns",
  },
  {
    up: migration_20260919_194626_add_user_favorites.up,
    down: migration_20260919_194626_add_user_favorites.down,
    name: "20260919_194626_add_user_favorites",
  },
  {
    up: migration_20260919_200842_add_lists.up,
    down: migration_20260919_200842_add_lists.down,
    name: "20260919_200842_add_lists",
  },
];
