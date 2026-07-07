# Mux Docs Skill

This skill provides Claude Code with access to comprehensive Mux documentation through an organized, filesystem-based reference library.

## Architecture

This skill uses **organized markdown files** for progressive disclosure - Claude reads only what's needed, when it's needed.

### Directory Structure

```
.claude/skills/mux-docs/
├── SKILL.md                          # Auto-generated navigation hub
├── README.md                         # This file
├── reference/                        # Auto-generated documentation
│   ├── core/                         # Core concepts and fundamentals
│   ├── video/                        # Video playback & assets
│   ├── live-streaming/               # Live streaming docs
│   ├── security/                     # Security & access control
│   ├── upload/                       # Upload & ingestion
│   ├── data-and-analytics/           # Data & analytics
│   ├── frameworks-and-integrations/  # Framework integrations
│   ├── examples/                     # Examples & use cases
│   └── misc/                         # Miscellaneous docs
└── scripts/
    └── build-docs-corpus.ts          # Build script

```

## How It Works

### Build Time
1. `build-docs-corpus.ts` reads the Mux docs repo
2. Parses and cleans MDX/Markdown files
3. Categorizes docs by topic
4. Generates organized markdown files in `reference/`
5. Auto-generates `SKILL.md` with category listings

### Runtime
1. Claude reads `SKILL.md` to understand available documentation
2. Uses `grep` to search across all docs
3. Reads specific files as needed (progressive disclosure)
4. Cites source URLs from each markdown file

## Key Features

### Auto-Generated SKILL.md
- No manual maintenance required
- Updates automatically when docs change
- Lists all categories with file counts
- Includes usage examples for grep/search

### Progressive Disclosure
- 212 markdown files don't consume context until read
- Claude searches and reads only relevant docs
- No wasted tokens on irrelevant content

### Semantic Search
- Claude uses native grep with regex
- Understands synonyms and related terms
- Can follow cross-references between files
- Much smarter than naive keyword matching

### Automatic Categorization
- Docs auto-categorized by content and path
- New Mux features appear automatically
- No manual file organization needed

## Usage

### Local Development

```bash
# Build the reference library from Mux docs repo
MUX_DOCS_REPO_PATH=/path/to/mux.com \
  npx tsx .claude/skills/mux-docs/scripts/build-docs-corpus.ts
```

### Environment Variables

- `MUX_DOCS_REPO_PATH` (required): Path to local checkout of `muxinc/mux.com`
- `MUX_DOCS_OUTPUT`: Output directory (default: `.claude/skills/mux-docs/reference`)
- `MUX_DOCS_BASE_URL`: Base URL for source links (default: `https://mux.com/docs`)
- `MUX_DOCS_DIR`: Docs directory override

### CI/CD

The reference library refreshes automatically via GitHub Actions:
- **Schedule**: Weekly (Mondays at 06:00 UTC)
- **Trigger**: Manual workflow dispatch
- **Process**: Clones docs repo → builds reference → commits changes
- **Files updated**: `reference/` directory + `SKILL.md`

**Required secrets:**
- `CI_PUSH_TOKEN`: GitHub token with push permissions
- `MUX_DOCS_REPO_URL`: Clone URL for private mux.com repo

## Comparison to Previous Approach

### Old (Corpus JSON + Search Script)
- ❌ Pre-filtered results (top 5 only)
- ❌ Naive keyword matching
- ❌ 1.7MB JSON hard to navigate
- ❌ Claude never saw full context
- ❌ Misaligned with best practices

### New (Organized Markdown Files)
- ✅ Claude searches all docs dynamically
- ✅ Semantic understanding of queries
- ✅ Organized by topic for discoverability
- ✅ Progressive disclosure (no wasted tokens)
- ✅ Aligned with Claude Skills best practices

## Adding New Documentation

When Mux adds new features (e.g., AI capabilities):

1. Next build run detects new docs automatically
2. Categorizes them based on content/path
3. Updates `SKILL.md` with new category if needed
4. CI/CD commits changes weekly

**No manual maintenance required!**

## Best Practices

When using this skill:
1. **Always cite sources**: Include the Source URL from markdown files
2. **Search first**: Use grep to find relevant docs
3. **Read selectively**: Only read files that match the query
4. **Follow references**: Docs may cross-reference each other

## Migration Notes

This refactor implements Claude Skills best practices:
- Progressive disclosure over pre-filtering
- Filesystem navigation over search scripts
- Semantic understanding over keyword matching
- Auto-generation over manual maintenance

For the full analysis and decision rationale, see the planning document.
