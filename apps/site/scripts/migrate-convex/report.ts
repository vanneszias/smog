/**
 * The Markdown report an `--apply` run writes to `--report`.
 *
 * It holds catalogue content only — category and gesture names and legacy
 * ids, which are public — and, for `users`, `user_favorites`,
 * `user_consents`, `sponsorships` and `adminLogs`, a count and nothing
 * else. Its inputs are typed so that is all it can be handed: the plan
 * (catalogue rows plus counts), the importer's result, and the
 * verification. The one free-text input is a failed create's error, and
 * {@link reportableError} keeps that only when the failing query touched
 * nothing but catalogue tables.
 */

import type { ApplyResult } from "./apply";
import type { Target } from "./guard";
import type { ImportPlan } from "./plan";
import type { VerifyResult } from "./verify";

interface ReportInput {
  target: Target;
  database: string;
  startedAt: Date;
  /** Catalogue documents already in the target with no legacy id. */
  withoutLegacyId: { categories: number; gestures: number };
  plan: ImportPlan;
  result: ApplyResult;
  /** Undefined when verification threw; the report then says so. */
  verification: VerifyResult | undefined;
  verificationError?: string;
}

const MAX_ERROR_LENGTH = 1000;

/** `categories`, `gestures`, `search` and their `_locales`/`_rels`/`_texts`. */
const CATALOGUE_TABLE = /^(?:categories|gestures|search)(?:_[a-z_]+)?$/;

const SKIP_REASONS: Record<ImportPlan["skipped"][number]["reason"], string> = {
  "no-category": "no category in the source; add at least one in the admin",
  "no-playback-id":
    "no video (playback id) in the source; attach one in the admin",
  "unknown-category":
    "names a category that is not in the export; pick its category in the admin",
};

/**
 * `message`, flattened to one line and capped — or a redaction, if it names
 * any table outside the catalogue. A driver error echoes the failing
 * query's parameters, so a query on `users` would put a user's row here.
 */
export function reportableError(message: string): string {
  const tables = [
    ...[...message.matchAll(/\b(?:into|from|update|join)\s+"([^"]+)"/gi)].map(
      (match) => match[1]
    ),
    ...[...message.matchAll(/constraint failed: ([A-Za-z0-9_]+)\./gi)].map(
      (match) => match[1]
    ),
  ];
  if (tables.some((table) => !CATALOGUE_TABLE.test(table ?? ""))) {
    return "[redacted: the failing query touched a table outside the catalogue; the full error is in the console output]";
  }
  const flat = message.replace(/\s+/g, " ").trim();
  return flat.length > MAX_ERROR_LENGTH
    ? `${flat.slice(0, MAX_ERROR_LENGTH)}…`
    : flat;
}

/** True when the run must exit non-zero. Editorial skips alone do not. */
export function runFailed(
  result: ApplyResult,
  verification: VerifyResult | undefined
): boolean {
  return (
    result.categories.failed.length > 0 ||
    result.gestures.failed.length > 0 ||
    result.gestures.skippedForFailedCategory.length > 0 ||
    verification?.ok !== true
  );
}

const cell = (value: string | number): string =>
  String(value).replace(/\r?\n/g, " ").replace(/\|/g, "\\|");

const code = (value: string): string => `\`${value.replace(/`/g, "'")}\``;

function table(headers: string[], rows: Array<Array<string | number>>): string {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ].join("\n");
}

export function buildReport(input: ReportInput): string {
  const { plan, result, verification } = input;
  const failed = runFailed(result, verification);
  const nameOf = new Map<string, string>([
    ...plan.categories.map((entry) => [entry.legacyId, entry.name] as const),
    ...plan.gestures.map((entry) => [entry.legacyId, entry.name] as const),
  ]);
  const named = (legacyId: string): string => nameOf.get(legacyId) ?? "";

  const out: string[] = [];
  out.push("# Convex catalogue import report", "");
  out.push(`- **Target:** ${input.target}`);
  out.push(`- **Database:** ${input.database}`);
  out.push(`- **Run started:** ${input.startedAt.toISOString()}`);
  out.push(
    `- **Already in the target without a legacy id (not from this import):** ${input.withoutLegacyId.categories} categories, ${input.withoutLegacyId.gestures} gestures`
  );
  out.push(
    `- **Outcome:** ${failed ? "FAILED — exit code 1" : "passed — exit code 0"}`,
    ""
  );

  out.push("## Source export (counts only)", "");
  out.push(
    table(
      ["Table", "Rows"],
      Object.entries(plan.counts).map(([name, count]) => [name, count])
    ),
    ""
  );

  out.push("## Import", "");
  out.push(
    table(
      ["Collection", "Planned", "Created", "Existing", "Failed"],
      [
        [
          "categories",
          plan.categories.length,
          result.categories.created,
          result.categories.existing,
          result.categories.failed.length,
        ],
        [
          "gestures",
          plan.gestures.length,
          result.gestures.created,
          result.gestures.existing,
          result.gestures.failed.length,
        ],
      ]
    ),
    ""
  );
  out.push(
    "`existing` means a document with that legacy id was already in the target and was left exactly as it is.",
    ""
  );

  const failures = [
    ...result.categories.failed.map((entry) => ["categories", entry] as const),
    ...result.gestures.failed.map((entry) => ["gestures", entry] as const),
  ];
  if (failures.length > 0) {
    out.push("### Failed", "");
    out.push(
      table(
        ["Collection", "Legacy id", "Name", "Error"],
        failures.map(([collection, entry]) => [
          collection,
          code(entry.legacyId),
          named(entry.legacyId),
          reportableError(entry.error),
        ])
      ),
      ""
    );
  }
  if (result.gestures.skippedForFailedCategory.length > 0) {
    out.push("### Skipped because a category they need failed", "");
    out.push(
      "Never created with fewer categories than the source had; a rerun once the category imports creates them.",
      ""
    );
    out.push(
      table(
        ["Legacy id", "Name"],
        result.gestures.skippedForFailedCategory.map((legacyId) => [
          code(legacyId),
          named(legacyId),
        ])
      ),
      ""
    );
  }

  out.push("## Needs editorial action", "");
  if (plan.skipped.length === 0) {
    out.push("None.", "");
  } else {
    out.push(
      "These gestures cannot satisfy the new model's required fields and were not imported. Add each in the admin after cutover.",
      ""
    );
    out.push(
      table(
        ["Legacy id", "Name", "Reason"],
        plan.skipped.map((entry) => [
          code(entry.legacyId),
          entry.name,
          `${entry.reason} — ${SKIP_REASONS[entry.reason]}`,
        ])
      ),
      ""
    );
  }

  out.push("## Dropped favourites", "");
  out.push(
    `${plan.dropped.favourites} favourites dropped, not migrated. They reference Convex ids of users who no longer exist — the old stack's GDPR deletion did not cascade to them — so they cannot be attached to anyone, and the people they belonged to asked to be deleted. No ids are recorded here.`,
    ""
  );

  out.push("## Verification", "");
  if (verification === undefined) {
    out.push(
      "**Did not complete.**",
      "",
      `verification did not complete: ${reportableError(input.verificationError ?? "unknown error")}`,
      "",
      "The import above did write. Rerun the same command: it creates nothing that exists, and verifies everything again.",
      ""
    );
  } else {
    out.push(...verificationSection(verification));
  }

  return out.join("\n");
}

function verificationSection(verification: VerifyResult): string[] {
  const out: string[] = [];
  out.push(verification.ok ? "**Passed.**" : "**Failed.**", "");

  out.push("### Incomplete — delete and rerun", "");
  if (verification.incomplete.length === 0) {
    out.push("None.", "");
  } else {
    out.push(
      "Each of these is in a state no legal save produces — a create that stopped part-way. The Remedy column says what to do. **delete and rerun**: the importer never updates a document, so delete it in the admin by the id given here and rerun; the rerun creates it whole. **re-save the gesture**: the gesture existed before this run and only its search entries are wrong (where it had none, every field was also checked against the export and matches); saving it in the admin rebuilds its one entry and keeps any editor's work. Never use the search collection's Reindex button on D1: it deletes every search entry in one statement that exceeds D1's 100-parameter cap, and leaves the index empty.",
      ""
    );
    out.push(
      table(
        ["Collection", "Id", "Legacy id", "Name", "Check failed", "Remedy"],
        verification.incomplete.map((entry) => [
          entry.collection,
          entry.id,
          code(entry.legacyId),
          entry.name,
          entry.check,
          entry.remedy,
        ])
      ),
      ""
    );
  }

  out.push("### Mismatches", "");
  if (verification.mismatches.length === 0) {
    out.push("None.", "");
  } else {
    for (const entry of verification.mismatches) {
      const who = entry.legacyId
        ? ` ${code(entry.legacyId)} ${cell(entry.name ?? "")}`
        : "";
      out.push(`- **${entry.subject}**${who}: ${cell(entry.problem)}`);
    }
    out.push("");
  }

  if (verification.differs.length > 0) {
    out.push(
      "### Differs from the export (existed before this run; not a failure)",
      ""
    );
    out.push(
      "These documents were already in the target when this run started, so they belong to the editors and the import left them alone. Most likely an editor changed them; check any you do not recognise. During the production cutover nobody edits, so on a production rerun any row here is the import's own fault: stop and investigate.",
      ""
    );
    out.push(
      table(
        [
          "Collection",
          "Id",
          "Legacy id",
          "Name (export)",
          "Field",
          "Difference",
        ],
        verification.differs.map((entry) => [
          entry.collection,
          entry.id,
          code(entry.legacyId),
          entry.name,
          entry.field,
          entry.detail,
        ])
      ),
      ""
    );
  }

  out.push("### Counts", "");
  out.push(
    table(
      ["Category", "Legacy id", "Gestures expected", "Gestures found"],
      verification.counts.perCategory.map((entry) => [
        entry.name,
        code(entry.legacyId),
        entry.expected,
        entry.actual,
      ])
    ),
    ""
  );
  const { activeCategories, activeGestures, userConsents } =
    verification.counts;
  out.push(
    table(
      ["Check", "Expected", "Found"],
      [
        [
          "active categories",
          activeCategories.expected,
          activeCategories.actual,
        ],
        ["active gestures", activeGestures.expected, activeGestures.actual],
        [
          "user-consents, information only (before → after)",
          userConsents.before,
          userConsents.after,
        ],
      ]
    ),
    ""
  );

  out.push("### How verification decides", "");
  out.push(
    "- **Incomplete** (fails): an empty Dutch name, a gesture with no categories, or a gesture without exactly one search entry. Validation forbids the first two and the search plugin re-syncs on every save, so no editor can cause them; every way a create can stop part-way ends in one of them.",
    "- A gesture with **no search entry at all** has never been saved by an editor, so it is compared with the export on every field the import writes; any difference is incomplete, delete and rerun, however old the gesture is.",
    "- **Mismatch** (fails): a planned document missing; a document this run created that differs from the plan (name, categories, concepts, playback id, info, active, created); a count that disagrees.",
    "- **Differs from the export** (does not fail): the same comparisons on a document that existed before this run, which an editor may legitimately have changed.",
    "- Expected counts use the plan for documents this run created and the document as found for ones that already existed.",
    "- **user-consents** is information only: consent writes are refused for the whole run, so the import cannot have changed it; other writers on a live database can.",
    ""
  );

  return out;
}
