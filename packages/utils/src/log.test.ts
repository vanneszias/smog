import { describe, expect, test } from "bun:test";
import { errorSummary, logUnhandledError, redactMessage } from "./log";

const TOKEN = "aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5zA7bC9d";

describe("redactMessage", () => {
  test("masks addresses, URL queries, credentials and long runs", () => {
    const text = [
      "send to anna.devries@example.test failed",
      `GET https://smog.example/sponsor/edit?token=${TOKEN}#frag 500`,
      "Authorization: Bearer abc.def.ghi",
      "password=hunter2 and cookie: session=abc123",
      `minted ${TOKEN}`,
    ].join("; ");
    const redacted = redactMessage(text);
    for (const secret of [
      "anna.devries",
      TOKEN,
      "frag",
      "abc.def.ghi",
      "hunter2",
      "abc123",
    ]) {
      expect(redacted).not.toContain(secret);
    }
    // The origin and the path stay, so the line is still useful.
    expect(redacted).toContain("https://smog.example/sponsor/edit 500");
  });

  test("keeps an ordinary message and cuts a long one", () => {
    expect(redactMessage("D1_ERROR: no such table: user")).toBe(
      "D1_ERROR: no such table: user"
    );
    expect(redactMessage("x ".repeat(500))).toHaveLength(300);
  });

  test("is idempotent", () => {
    const once = redactMessage(`bad ${TOKEN} for a@example.test`);
    expect(redactMessage(once)).toBe(once);
  });
});

describe("errorSummary", () => {
  test("is the name and a redacted message, never the stack or properties", () => {
    const error = Object.assign(new TypeError("boom for a@example.test"), {
      headers: { authorization: "Bearer secret" },
    });
    const summary = errorSummary(error);
    expect(summary).toEqual({
      message: "boom for [redacted]",
      name: "TypeError",
    });
    expect(JSON.stringify(summary)).not.toContain("secret");
  });

  test("copes with a thrown string and a thrown object", () => {
    expect(errorSummary("token=abc")).toEqual({
      message: "token=[redacted]",
      name: "string",
    });
    expect(errorSummary({ secret: "x" })).toEqual({
      message: "",
      name: "object",
    });
  });
});

describe("logUnhandledError", () => {
  test("logs one `[error] <entry> {json}` line with the id", () => {
    const lines: string[] = [];
    logUnhandledError("queue", new RangeError("too big"), "ray-1", (line) =>
      lines.push(line)
    );
    expect(lines).toEqual([
      '[error] queue {"id":"ray-1","message":"too big","name":"RangeError"}',
    ]);
  });
});
