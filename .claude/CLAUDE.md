# Ultracite Code Standards

Project uses **Ultracite**, a zero-config Biome preset for code quality.

## Commands

```bash
npx ultracite fix    # Format and fix
npx ultracite check  # Check for issues
npx ultracite doctor # Diagnose setup
```

## Core Principles

Write **accessible, performant, type-safe, maintainable** code. Focus on clarity.

### TypeScript

- Use explicit types when they enhance clarity
- Prefer `unknown` over `any`
- Use `as const` for immutable values
- Use meaningful names instead of magic numbers
- Leverage type narrowing

### Modern JS/TS

- Arrow functions for callbacks
- `for...of` over `.forEach()` and indexed loops
- Optional chaining (`?.`) and nullish coalescing (`??`)
- Template literals over concatenation
- Destructuring for assignments
- `const` by default, `let` when needed, never `var`

### Async

- Always `await` promises in async functions
- `async/await` over promise chains
- Handle errors with try-catch
- Don't use async functions as Promise executors

### React

- Function components over class
- Call hooks at top level only
- Specify all hook dependencies
- Use unique IDs for `key` prop
- Nest children in tags, not props
- Don't define components inside components
- Semantic HTML and ARIA attributes for accessibility

### Error Handling

- Remove `console.log`, `debugger`, `alert` from production
- Throw `Error` objects with descriptive messages
- Use try-catch meaningfully
- Early returns over nested conditionals

### Code Organization

- Keep functions focused
- Extract complex conditions to variables
- Early returns to reduce nesting
- Group related code

### Security

- Add `rel="noopener"` with `target="_blank"`
- Avoid `dangerouslySetInnerHTML`
- Don't use `eval()` or direct `document.cookie`
- Validate and sanitize input

### Performance

- Avoid spread syntax in loop accumulators
- Use top-level regex literals
- Specific imports over namespace imports
- Avoid barrel files
- Use proper image components

## Testing

- Assertions in `it()` or `test()` blocks
- Async tests use async/await, not done callbacks
- No `.only` or `.skip` in committed code
- Keep test suites flat

## Focus Areas

Biome handles most issues automatically. Focus on:

1. Business logic correctness
2. Meaningful naming
3. Architecture decisions
4. Edge cases
5. User experience (accessibility, performance)
6. Documentation for complex logic

Run `npx ultracite fix` before committing.
