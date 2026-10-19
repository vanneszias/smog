/**
 * `we-moved` (phase 8 task 9) parses each message with `@smog/jobs`'
 * `emailMessageSchema`, which reaches `@smog/email`'s sender through its
 * imports. The Bun programme never sends an email or opens a KV binding,
 * so it names the three Workers types the sender's signatures use, as far
 * as the sender uses them, without loading the Workers runtime types
 * (which clash with Bun's; see `d1-ambient.d.ts`).
 */
interface EmailAddress {
  email: string;
  name: string;
}

interface SendEmail {
  send: (message: unknown) => Promise<unknown>;
}

interface KVNamespace {
  get: {
    (key: string): Promise<string | null>;
    <ExpectedValue = unknown>(
      key: string,
      type: "json"
    ): Promise<ExpectedValue | null>;
  };
  put: (
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ) => Promise<void>;
}
