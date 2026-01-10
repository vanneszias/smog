# @smog/convex

Shared Convex schema and types for all SMOG apps.

## Usage

### React Native/Web (Hooks)
```ts
import { api } from "@smog/convex";
import { useQuery } from "convex/react";

const gestures = useQuery(api.gestures.list, {
  paginationOpts: { numItems: 20, cursor: null }
});
```

### Server/API (HTTP Client)
```ts
import { api } from "@smog/convex";
import { ConvexHttpClient } from "convex/browser";

const client = new ConvexHttpClient(process.env.CONVEX_URL);
const result = await client.query(api.gestures.list, {...});
```

## Commands

```bash
bun codegen        # Generate types
bun dev            # Watch for changes
bun deploy         # Deploy to production
```

## Schema Files

- `schema.ts` - Database schema
- `categories.ts` - Category queries
- `gestures.ts` - Gesture queries
- `favorites.ts` - Favorites mutations/queries
- `users.ts` - User management
