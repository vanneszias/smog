#!/usr/bin/env npx tsx
import fs from "node:fs";
import path from "node:path";

interface FrontmatterResult {
  data: Record<string, string | number>;
  body: string;
}

interface CorpusEntry {
  id: string;
  title: string;
  path: string;
  sourceUrl: string;
  order?: number;
  content: string;
}

interface CategoryInfo {
  dirName: string;
  displayName: string;
  description: string;
  files: string[];
}

const docsRepoPath = process.env.MUX_DOCS_REPO_PATH || path.resolve(process.cwd(), "../mux.com");
const docsDir = process.env.MUX_DOCS_DIR || path.join(docsRepoPath, "apps", "web", "app", "docs");
const outputPath = process.env.MUX_DOCS_OUTPUT || path.resolve(".claude/skills/mux-docs/reference");
const skillMdPath = path.resolve(".claude/skills/mux-docs/SKILL.md");
const baseUrl = process.env.MUX_DOCS_BASE_URL || "https://mux.com/docs";

// Category metadata - describes what each category contains
const CATEGORY_METADATA: Record<string, { display: string; description: string }> = {
  video: {
    display: "Video Playback & Assets",
    description: "HLS/DASH streaming, players, playback policies, encoding, thumbnails, watermarks, captions",
  },
  "live-streaming": {
    display: "Live Streaming",
    description: "Broadcasting, RTMP/SRT, stream keys, recording, DVR, latency optimization",
  },
  security: {
    display: "Security & Access Control",
    description: "Signed URLs, JWT signing, DRM protection, playback restrictions, authentication",
  },
  upload: {
    display: "Upload & Ingestion",
    description: "Direct uploads, file ingestion, upload workflows, client-side uploaders",
  },
  "data-and-analytics": {
    display: "Data & Analytics",
    description: "QoS metrics, viewer analytics, custom dashboards, monitoring, alerts, webhooks",
  },
  core: {
    display: "Core Concepts",
    description: "Fundamentals, API basics, SDKs, webhooks, getting started guides",
  },
  "frameworks-and-integrations": {
    display: "Frameworks & Integrations",
    description: "React, Next.js, Vue, Laravel, CMS integrations, platform-specific SDKs",
  },
  examples: {
    display: "Examples & Use Cases",
    description: "Sample implementations, common patterns, integration examples",
  },
  misc: {
    display: "Miscellaneous",
    description: "Other documentation and guides",
  },
};

if (!fs.existsSync(docsDir)) {
  console.error(`❌ Docs directory not found: ${docsDir}`);
  console.error("Set MUX_DOCS_REPO_PATH to your local mux.com checkout.");
  process.exit(1);
}

function parseFrontmatter(source: string): FrontmatterResult {
  const match = source.match(/^---\s*[\r\n]([\s\S]*?)[\r\n]---\s*[\r\n]?/);
  if (!match) {
    return { data: {}, body: source };
  }

  const rawFrontmatter = match[1].trim();
  const body = source.slice(match[0].length);
  const data: Record<string, string | number> = {};

  for (const line of rawFrontmatter.split(/\r?\n/)) {
    const [key, ...rest] = line.split(":");
    if (!key || rest.length === 0) continue;
    const value = rest.join(":").trim().replace(/^['"]|['"]$/g, "");
    const maybeNumber = Number(value);
    data[key.trim()] = Number.isNaN(maybeNumber) ? value : maybeNumber;
  }

  return { data, body };
}

function stripMarkdownAndMdx(body: string): string {
  const codeBlocks: string[] = [];
  const placeholder = (index: number) => `@@CODE_BLOCK_${index}@@`;

  let working = body.replace(/```[\s\S]*?```/g, (match) => {
    const idx = codeBlocks.length;
    codeBlocks.push(match.trim());
    return placeholder(idx);
  });

  working = working
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return !(trimmed.startsWith("import ") || trimmed.startsWith("export "));
    })
    .join("\n");

  working = working.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
  working = working.replace(/<[^>\n]+>/g, "");
  working = working.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");
  working = working.replace(/`([^`]+)`/g, "$1");
  working = working.replace(/\*\*([^*]+)\*\*/g, "$1");
  working = working.replace(/\*([^*]+)\*/g, "$1");
  working = working.replace(/__([^_]+)__/g, "$1");
  working = working.replace(/#+\s*/g, "");
  working = working.replace(/\n{3,}/g, "\n\n");

  const restored = working.replace(/@@CODE_BLOCK_(\d+)@@/g, (_, idx) => {
    const block = codeBlocks[Number(idx)];
    return block ? `\n${block}\n` : "";
  });

  return restored
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function walkDocs(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDocs(fullPath));
    } else if (/\.mdx?$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function toSlug(relativePath: string): string {
  let slug = relativePath.replace(/\\/g, "/");
  slug = slug.replace(/\/page\.mdx?$/, "/");
  slug = slug.replace(/index\.mdx?$/, "");
  slug = slug.replace(/\.mdx?$/, "");
  if (slug.startsWith("/")) slug = slug.slice(1);
  return slug;
}

/**
 * Determines the category directory for a doc entry based on its path and content
 */
function categorizeDoc(docPath: string, content: string, title: string): string {
  const lowerPath = docPath.toLowerCase();
  const lowerContent = content.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const searchText = `${lowerPath} ${lowerContent} ${lowerTitle}`;

  // Framework and SDK integrations
  if (lowerPath.includes("frameworks/") || lowerPath.includes("integrations/")) {
    return "frameworks-and-integrations";
  }

  // Live streaming
  if (
    searchText.includes("live stream") ||
    searchText.includes("live-stream") ||
    searchText.includes("broadcast") ||
    searchText.includes("rtmp") ||
    searchText.includes("srt ") ||
    lowerPath.includes("live")
  ) {
    return "live-streaming";
  }

  // Security and signed URLs
  if (
    searchText.includes("signed") ||
    searchText.includes("drm") ||
    searchText.includes("secure") ||
    searchText.includes("jwt") ||
    searchText.includes("playback restriction") ||
    searchText.includes("playback-restriction")
  ) {
    return "security";
  }

  // Upload
  if (
    searchText.includes("upload") ||
    searchText.includes("direct upload") ||
    searchText.includes("uploader")
  ) {
    return "upload";
  }

  // Data and analytics
  if (
    searchText.includes("data") ||
    searchText.includes("metric") ||
    searchText.includes("analytics") ||
    searchText.includes("dashboard") ||
    searchText.includes("monitor") ||
    searchText.includes("alert")
  ) {
    return "data-and-analytics";
  }

  // Video playback and assets (default for most video content)
  if (
    searchText.includes("playback") ||
    searchText.includes("video") ||
    searchText.includes("asset") ||
    searchText.includes("player") ||
    searchText.includes("thumbnail") ||
    searchText.includes("image") ||
    searchText.includes("watermark") ||
    searchText.includes("clip") ||
    searchText.includes("encode") ||
    searchText.includes("caption") ||
    searchText.includes("subtitle")
  ) {
    return "video";
  }

  // Core concepts and fundamentals
  if (lowerPath.includes("core/") || searchText.includes("fundamental")) {
    return "core";
  }

  // Examples
  if (lowerPath.includes("examples/")) {
    return "examples";
  }

  // Default to misc
  return "misc";
}

/**
 * Generates a safe filename from a doc path
 */
function generateFilename(docPath: string, title: string): string {
  // Start with the filename from the path
  const basename = path.basename(docPath, path.extname(docPath));

  // If it's "index" or "page", use the parent directory name + title slug
  if (basename === "index" || basename === "page") {
    const parentDir = path.basename(path.dirname(docPath));
    if (parentDir && parentDir !== "." && parentDir !== "/") {
      return `${parentDir}.md`;
    }
  }

  // Use the basename if it's descriptive
  if (basename.length > 3) {
    return `${basename}.md`;
  }

  // Fall back to slugified title
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug}.md`;
}

function buildCorpus(): CorpusEntry[] {
  const files = walkDocs(docsDir).sort();
  const corpus: CorpusEntry[] = [];

  files.forEach((filePath, idx) => {
    const raw = fs.readFileSync(filePath, "utf8");
    const { data, body } = parseFrontmatter(raw);
    const content = stripMarkdownAndMdx(body);
    const relative = path.relative(docsDir, filePath);
    const slug = toSlug(relative);
    const sourceUrl = new URL(slug, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();

    corpus.push({
      id: `${idx + 1}-${slug || "root"}`,
      title: (data.title as string) || slug || relative,
      path: relative,
      sourceUrl,
      order: (data.order as number) || undefined,
      content,
    });
  });

  corpus.sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
      return (a.order as number) - (b.order as number);
    }
    return a.path.localeCompare(b.path);
  });

  return corpus;
}

function writeMarkdownFiles(corpus: CorpusEntry[]): Map<string, string[]> {
  // Track files per category
  const categoryFiles = new Map<string, string[]>();

  // Clear output directory if it exists
  if (fs.existsSync(outputPath)) {
    fs.rmSync(outputPath, { recursive: true, force: true });
  }

  for (const entry of corpus) {
    const category = categorizeDoc(entry.path, entry.content, entry.title);
    const categoryDir = path.join(outputPath, category);

    // Create category directory if needed
    fs.mkdirSync(categoryDir, { recursive: true });

    // Generate filename
    const filename = generateFilename(entry.path, entry.title);
    const filepath = path.join(categoryDir, filename);

    // Check for filename collision and append number if needed
    let finalPath = filepath;
    let finalFilename = filename;
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      finalFilename = `${base}-${counter}${ext}`;
      finalPath = path.join(categoryDir, finalFilename);
      counter++;
    }

    // Generate markdown content
    const markdownContent = `# ${entry.title}

**Source:** ${entry.sourceUrl}

${entry.content}
`;

    // Write file
    fs.writeFileSync(finalPath, markdownContent, "utf8");

    // Track file in category
    if (!categoryFiles.has(category)) {
      categoryFiles.set(category, []);
    }
    categoryFiles.get(category)!.push(finalFilename);
  }

  return categoryFiles;
}

function generateSkillMd(categoryFiles: Map<string, string[]>) {
  // Sort categories by predefined order, then alphabetically
  const categoryOrder = [
    "core",
    "video",
    "live-streaming",
    "security",
    "upload",
    "data-and-analytics",
    "frameworks-and-integrations",
    "examples",
    "misc",
  ];

  const sortedCategories = Array.from(categoryFiles.keys()).sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a);
    const bIndex = categoryOrder.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });

  let skillContent = `---
name: mux-docs
description: Answer questions about Mux Video, Live Streaming, Data APIs, and SDKs. Use when user asks about Mux features, implementation patterns, API usage, troubleshooting, or best practices. Covers playback, encoding, live streaming, analytics, security, and more.
---

# Mux Documentation

Comprehensive reference documentation for Mux's video infrastructure platform.

## Available Documentation

The documentation is organized into the following categories:

`;

  // Generate category listings
  for (const category of sortedCategories) {
    const files = categoryFiles.get(category)!;
    const metadata = CATEGORY_METADATA[category] || {
      display: category.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      description: "Documentation files",
    };

    skillContent += `### ${metadata.display}\n`;
    skillContent += `${metadata.description}\n\n`;
    skillContent += `**Location:** \`reference/${category}/\` (${files.length} ${files.length === 1 ? "file" : "files"})\n\n`;
  }

  skillContent += `## How to Use This Documentation

### Browse by Category

Navigate to a category directory and read relevant files:

\`\`\`bash
# List all files in a category
ls .claude/skills/mux-docs/reference/video/

# Read a specific file
cat .claude/skills/mux-docs/reference/security/signed-urls.md
\`\`\`

### Search Across All Documentation

Use grep to find topics across all files:

\`\`\`bash
# Search for a keyword
grep -ri "keyword" .claude/skills/mux-docs/reference/

# Search within a specific category
grep -ri "playback" .claude/skills/mux-docs/reference/video/

# Find files mentioning a topic
grep -l "webhook" .claude/skills/mux-docs/reference/*/*.md

# Search with context lines
grep -ri -C 3 "jwt" .claude/skills/mux-docs/reference/security/
\`\`\`

### Find Related Topics

\`\`\`bash
# Multiple keywords (AND)
grep -ri "signed" .claude/skills/mux-docs/reference/ | grep "playback"

# Multiple keywords (OR)
grep -riE "(signed|drm|secure)" .claude/skills/mux-docs/reference/
\`\`\`

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
`;

  // Write SKILL.md
  fs.writeFileSync(skillMdPath, skillContent, "utf8");
  console.log(`\n✅ Generated SKILL.md with ${sortedCategories.length} categories`);
}

function main() {
  console.log("📚 Building Mux docs reference library...");
  const corpus = buildCorpus();
  console.log(`📖 Processed ${corpus.length} documentation files`);

  const categoryFiles = writeMarkdownFiles(corpus);

  console.log(`\n✅ Wrote ${corpus.length} markdown files to ${outputPath}`);
  console.log("\nFiles by category:");
  const sortedCats = Array.from(categoryFiles.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [category, files] of sortedCats) {
    console.log(`  ${category.padEnd(35)} ${files.length.toString().padStart(3)} files`);
  }

  generateSkillMd(categoryFiles);
  console.log(`\n🎯 Documentation reference library ready!`);
}

main();
