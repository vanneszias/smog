import { isContractProcedure } from "@orpc/contract";
import { makeGesture } from "@smog/db/testing";
import { TURNSTILE_HEADER } from "@smog/rpc/contract";
import { newId } from "@smog/utils";
import { describe, expect, it } from "vitest";
import {
  SPONSORSHIP_PROCEDURE_GUARDS,
  sponsorshipsContract,
} from "../src/contract";
import { callAt, testDb } from "./helpers";

const db = testDb();

const deny = { limit: () => Promise.resolve({ success: false }) };

/** Every procedure path of the contract (`"reedit.get"`). */
function paths(node: unknown, prefix = ""): string[] {
  if (isContractProcedure(node)) {
    return [prefix];
  }
  return Object.entries(node as Record<string, unknown>).flatMap(
    ([key, child]) => paths(child, prefix ? `${prefix}.${key}` : key)
  );
}

const TOKEN = "a".repeat(43);

/** The error code a call failed with, or `"ok"`. */
async function codeOf(result: Promise<unknown>): Promise<string> {
  try {
    await result;
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  }
}

/** A valid input for each procedure, so only the guards can refuse it. */
async function inputFor(path: string): Promise<unknown> {
  const gesture = await makeGesture(db);
  const inputs: Record<string, unknown> = {
    availability: { gestureIds: [gesture.id] },
    checkout: {
      checkoutId: newId(),
      contact: { email: "alex@example.com", name: "Alex" },
      displayName: "Acme",
      expectedTotalCents: 5000,
      gestureIds: [gesture.id],
      locale: "nl",
    },
    paymentStatus: { payment: newId() },
    quote: { gestureIds: [gesture.id], logo: false },
    "reedit.get": { token: TOKEN },
    "reedit.submit": { displayName: "Acme", token: TOKEN },
    "renewal.checkout": { checkoutId: newId(), token: TOKEN },
    "renewal.get": { token: TOKEN },
    uploadLogo: { contentType: "image/png", size: 1000 },
  };
  return inputs[path];
}

/** Ruling 5: Turnstile and RL_SPONSOR on the public mutations. */
const EXPECTED = {
  availability: { rateLimit: "RL_API", turnstile: false },
  checkout: { rateLimit: "RL_SPONSOR", turnstile: true },
  paymentStatus: { rateLimit: "RL_API", turnstile: false },
  quote: { rateLimit: "RL_API", turnstile: false },
  "reedit.get": { rateLimit: "RL_API", turnstile: false },
  "reedit.submit": { rateLimit: "RL_SPONSOR", turnstile: true },
  "renewal.checkout": { rateLimit: "RL_SPONSOR", turnstile: true },
  "renewal.get": { rateLimit: "RL_API", turnstile: false },
  uploadLogo: { rateLimit: "RL_SPONSOR", turnstile: false },
};

describe("the sponsorships contract and its guards (ruling 5)", () => {
  it("declares the guards of every procedure, as the ruling says", () => {
    expect(paths(sponsorshipsContract).sort()).toEqual(
      Object.keys(EXPECTED).sort()
    );
    expect(SPONSORSHIP_PROCEDURE_GUARDS).toEqual(EXPECTED);
  });

  for (const [path, guard] of Object.entries(EXPECTED)) {
    it(`${path}: ${guard.rateLimit === "RL_SPONSOR" ? "RL_SPONSOR" : "no RL_SPONSOR"}`, async () => {
      const result = callAt(path, await inputFor(path), {
        env: { RL_SPONSOR: deny },
      });
      const code = await codeOf(result);
      if (guard.rateLimit === "RL_SPONSOR") {
        expect(code).toBe("RATE_LIMITED");
      } else {
        expect(code).not.toBe("RATE_LIMITED");
      }
    });

    it(`${path}: ${guard.turnstile ? "Turnstile required" : "no Turnstile"}`, async () => {
      const result = callAt(path, await inputFor(path), {
        env: { TURNSTILE_SECRET_KEY: "secret" },
        request: new Request("http://localhost:5173/api/rpc/x", {
          headers: { [TURNSTILE_HEADER]: "" },
        }),
      });
      const code = await codeOf(result);
      if (guard.turnstile) {
        expect(code).toBe("TURNSTILE_FAILED");
      } else {
        expect(code).not.toBe("TURNSTILE_FAILED");
      }
    });
  }

  it("the slices task 5 fills answer INTERNAL_SERVER_ERROR until then", async () => {
    await expect(
      callAt("reedit.get", await inputFor("reedit.get"))
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "not implemented",
    });
  });
});
