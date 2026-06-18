# mollie-best-practices

A Claude / agent skill for **Mollie payments integration** — covers iDEAL, credit cards via Mollie Components, hosted checkout for other methods, webhook handling, and a complete **Medusa v2 custom payment provider** implementation.

Captures Mollie-specific gotchas that the [`stripe-best-practices`](https://github.com/stripe/ai) skill doesn't cover: API key vs OAuth `profileId` rejection, iframe sandbox styling pitfalls, the `padding` shorthand bug in the Components SDK bridge, vertical alignment fix via internal padding, validation gating on `dirty && error` (never `touched`), Medusa v2 provider ID composition rules, and the seed/region wiring needed to expose providers on existing databases.

## Install

```bash
npx skills add todaytomorroworg/mollie-best-practices
```

The skill loads automatically into Claude Code, Cursor, Codex, Gemini CLI, and other agent harnesses when you start working on a Mollie integration.

## What's inside

```
SKILL.md                       — Entry point: routing table + critical rules
references/
├── payments.md                — Payments API, methods, amount format, sequenceType
├── components.md              — Components SDK, styling, iframe alignment pitfalls
├── webhooks.md                — Webhook flow + return-URL polling pattern
├── medusa.md                  — Medusa v2 provider module implementation
└── pitfalls.md                — Running index of API rejections + SDK gotchas
```

## When to use

The skill triggers on prompts like:

- "integrate Mollie", "add iDEAL checkout", "build a Mollie payment provider for Medusa"
- "migrate from Stripe to Mollie"
- Any code that imports `@mollie/api-client` or loads `js.mollie.com/v1/mollie.js`
- Mollie API error messages (`Non-existent body parameter`, `amount.value must be a string`, etc.)

## License

MIT
