import { describe, expect, test } from "bun:test";
import { resources } from "@smog/i18n";
import { DAY_MS } from "@smog/utils";
import {
  INVALID_STATE_REASON_KEYS,
  REJECTED_VIDEO_PURGE_PER_RUN,
  REJECTED_VIDEO_RETENTION_DAYS,
  REJECTED_VIDEO_RETENTION_MS,
} from "./index";

describe("the rejected video's retention (phase 8 ruling 13)", () => {
  test("30 days, 20 assets per run", () => {
    expect(REJECTED_VIDEO_RETENTION_DAYS).toBe(30);
    expect(REJECTED_VIDEO_RETENTION_MS).toBe(30 * DAY_MS);
    expect(REJECTED_VIDEO_PURGE_PER_RUN).toBe(20);
  });

  test("the rejectedTooLongAgo copy names the same number of days", () => {
    const [group, , reason] =
      INVALID_STATE_REASON_KEYS.rejectedTooLongAgo.split(".");
    expect(group).toBe("sponsorship");
    for (const locale of ["nl", "en", "fr"] as const) {
      const { errors } = (
        resources[locale].translation as unknown as {
          sponsorship: { errors: Record<string, string> };
        }
      ).sponsorship;
      expect(errors[reason as string]).toContain(
        String(REJECTED_VIDEO_RETENTION_DAYS)
      );
    }
  });
});
