# @smog/convex

Shared Convex schema and generated types for all SMOG applications.

## Usage

### In Native App (React)
```typescript
import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { useQuery } from "convex/react";

const gestures = useQuery(api.gestures.list, { 
  paginationOpts: { numItems: 20, cursor: null } 
});
```

### In Server/API (HTTP Client)
```typescript
import { api } from "@smog/convex";
import { ConvexHttpClient } from "convex/browser";

const client = new ConvexHttpClient(process.env.CONVEX_URL);
const result = await client.query(api.gestures.list, {...});
```

## Development

```bash
# Generate types
bun run codegen

# Watch for changes (requires deployment)
bun run dev

# Deploy to production
bun run deploy
```

## Schema Files

- `schema.ts` - Database schema definitions
- `categories.ts` - Category queries
- `gestures.ts` - Gesture queries
- `favorites.ts` - User favorites mutations/queries
- `users.ts` - User management with WorkOS integration
