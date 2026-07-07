---
name: mux-docs
description: Answer questions about Mux Video, Live Streaming, Data APIs, and SDKs. Use when user asks about Mux features, implementation patterns, API usage, troubleshooting, or best practices. Covers playback, encoding, live streaming, analytics, security, and more.
---

# Mux Documentation

Comprehensive reference documentation for Mux's video infrastructure platform.

## Available Documentation

The documentation is organized into the following categories:

### Core Concepts
Fundamentals, API basics, SDKs, webhooks, getting started guides

**Location:** `reference/core/` (1 file)

### Video Playback & Assets
HLS/DASH streaming, players, playback policies, encoding, thumbnails, watermarks, captions

**Location:** `reference/video/` (7 files)

### Live Streaming
Broadcasting, RTMP/SRT, stream keys, recording, DVR, latency optimization

**Location:** `reference/live-streaming/` (70 files)

### Security & Access Control
Signed URLs, JWT signing, DRM protection, playback restrictions, authentication

**Location:** `reference/security/` (40 files)

### Upload & Ingestion
Direct uploads, file ingestion, upload workflows, client-side uploaders

**Location:** `reference/upload/` (12 files)

### Data & Analytics
QoS metrics, viewer analytics, custom dashboards, monitoring, alerts, webhooks

**Location:** `reference/data-and-analytics/` (48 files)

### Frameworks & Integrations
React, Next.js, Vue, Laravel, CMS integrations, platform-specific SDKs

**Location:** `reference/frameworks-and-integrations/` (40 files)

### Miscellaneous
Other documentation and guides

**Location:** `reference/misc/` (1 file)

## How to Use This Documentation

### Browse by Category

Navigate to a category directory and read relevant files:

```bash
# List all files in a category
ls .claude/skills/mux-docs/reference/video/

# Read a specific file
cat .claude/skills/mux-docs/reference/security/signed-urls.md
```

### Search Across All Documentation

Use grep to find topics across all files:

```bash
# Search for a keyword
grep -ri "keyword" .claude/skills/mux-docs/reference/

# Search within a specific category
grep -ri "playback" .claude/skills/mux-docs/reference/video/

# Find files mentioning a topic
grep -l "webhook" .claude/skills/mux-docs/reference/*/*.md

# Search with context lines
grep -ri -C 3 "jwt" .claude/skills/mux-docs/reference/security/
```

### Find Related Topics

```bash
# Multiple keywords (AND)
grep -ri "signed" .claude/skills/mux-docs/reference/ | grep "playback"

# Multiple keywords (OR)
grep -riE "(signed|drm|secure)" .claude/skills/mux-docs/reference/
```

## Documentation Format

Each markdown file contains:
- **Title**: The document heading
- **Source URL**: Link to the official Mux docs (always cite this when referencing)
- **Content**: Cleaned documentation text with code examples

## Best Practices

1. **Always cite sources**: Include the Source URL when referencing documentation
2. **Search first**: Use grep to find relevant docs before browsing
3. **Check multiple files**: Related topics may be split across files
4. **Follow cross-references**: Documents may reference each other for deeper details
