import * as migration_20250929_111647 from "./20250929_111647";
import * as migration_20260919_174541_add_categories from "./20260919_174541_add_categories";
import * as migration_20260919_180415_add_gestures from "./20260919_180415_add_gestures";
import * as migration_20260919_183041_payload_3_90_upgrade from "./20260919_183041_payload_3_90_upgrade";
import * as migration_20260919_190548_add_user_roles from "./20260919_190548_add_user_roles";
import * as migration_20260919_193653_revert_3_90_columns from "./20260919_193653_revert_3_90_columns";
import * as migration_20260919_194626_add_user_favorites from "./20260919_194626_add_user_favorites";
import * as migration_20260919_200842_add_lists from "./20260919_200842_add_lists";
import * as migration_20260919_212934_add_sponsorships_and_audit from "./20260919_212934_add_sponsorships_and_audit";
import * as migration_20260919_214755_add_sponsorship_token_unique_indexes from "./20260919_214755_add_sponsorship_token_unique_indexes";
import * as migration_20260919_222612_nullable_consent_user from "./20260919_222612_nullable_consent_user";
import * as migration_20260919_230345_add_search from "./20260919_230345_add_search";
import * as migration_20260920_103500_share_token_defaults from "./20260920_103500_share_token_defaults";
import * as migration_20260920_114500_list_fk_behaviour from "./20260920_114500_list_fk_behaviour";
import * as migration_20260920_160000_add_user_oauth_accounts from "./20260920_160000_add_user_oauth_accounts";
import * as migration_20260920_233000_add_user_pending_email from "./20260920_233000_add_user_pending_email";
import * as migration_20260921_090000_add_webhook_deliveries from "./20260921_090000_add_webhook_deliveries";
import * as migration_20260921_120000_sponsorship_payment_id_not_unique from "./20260921_120000_sponsorship_payment_id_not_unique";
import * as migration_20260921_140000_add_renders from "./20260921_140000_add_renders";
import * as migration_20260921_160000_add_render_completions from "./20260921_160000_add_render_completions";
import * as migration_20260921_180000_add_claims from "./20260921_180000_add_claims";

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
  {
    up: migration_20260919_212934_add_sponsorships_and_audit.up,
    down: migration_20260919_212934_add_sponsorships_and_audit.down,
    name: "20260919_212934_add_sponsorships_and_audit",
  },
  {
    up: migration_20260919_214755_add_sponsorship_token_unique_indexes.up,
    down: migration_20260919_214755_add_sponsorship_token_unique_indexes.down,
    name: "20260919_214755_add_sponsorship_token_unique_indexes",
  },
  {
    up: migration_20260919_222612_nullable_consent_user.up,
    down: migration_20260919_222612_nullable_consent_user.down,
    name: "20260919_222612_nullable_consent_user",
  },
  {
    up: migration_20260919_230345_add_search.up,
    down: migration_20260919_230345_add_search.down,
    name: "20260919_230345_add_search",
  },
  {
    up: migration_20260920_103500_share_token_defaults.up,
    down: migration_20260920_103500_share_token_defaults.down,
    name: "20260920_103500_share_token_defaults",
  },
  {
    up: migration_20260920_114500_list_fk_behaviour.up,
    down: migration_20260920_114500_list_fk_behaviour.down,
    name: "20260920_114500_list_fk_behaviour",
  },
  {
    up: migration_20260920_160000_add_user_oauth_accounts.up,
    down: migration_20260920_160000_add_user_oauth_accounts.down,
    name: "20260920_160000_add_user_oauth_accounts",
  },
  {
    up: migration_20260920_233000_add_user_pending_email.up,
    down: migration_20260920_233000_add_user_pending_email.down,
    name: "20260920_233000_add_user_pending_email",
  },
  {
    up: migration_20260921_090000_add_webhook_deliveries.up,
    down: migration_20260921_090000_add_webhook_deliveries.down,
    name: "20260921_090000_add_webhook_deliveries",
  },
  {
    up: migration_20260921_120000_sponsorship_payment_id_not_unique.up,
    down: migration_20260921_120000_sponsorship_payment_id_not_unique.down,
    name: "20260921_120000_sponsorship_payment_id_not_unique",
  },
  {
    up: migration_20260921_140000_add_renders.up,
    down: migration_20260921_140000_add_renders.down,
    name: "20260921_140000_add_renders",
  },
  {
    up: migration_20260921_160000_add_render_completions.up,
    down: migration_20260921_160000_add_render_completions.down,
    name: "20260921_160000_add_render_completions",
  },
  {
    up: migration_20260921_180000_add_claims.up,
    down: migration_20260921_180000_add_claims.down,
    name: "20260921_180000_add_claims",
  },
];
