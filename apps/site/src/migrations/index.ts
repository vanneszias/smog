import * as migration_20250929_111647 from "./20250929_111647";
import * as migration_20260919_174541_add_categories from "./20260919_174541_add_categories";
import * as migration_20260919_180415_add_gestures from "./20260919_180415_add_gestures";
import * as migration_20260919_183041_payload_3_90_upgrade from "./20260919_183041_payload_3_90_upgrade";
import * as migration_20260919_190548_add_user_roles from "./20260919_190548_add_user_roles";

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
];
