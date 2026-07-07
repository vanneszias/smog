# Getting started for AI agents

**Source:** https://mux.com/docs/_guides/core/ai-agents

Getting started for AI agents

This guide is written for LLMs and AI coding agents. It contains everything you need to write working code against the Mux API on the first try.

CLI

The Mux CLI (@mux/cli) lets you manage Mux resources directly from the terminal. It is useful for quick operations, scripting, automation, and CI/CD pipelines.

Install:


```bash
npm install -g @mux/cli    # global install
# or run directly without installing:
npx @mux/cli
# or install via Homebrew:
brew install muxinc/tap/mux
```


After installing, authenticate with mux login or set MUX_TOKEN_ID and MUX_TOKEN_SECRET environment variables. Always pass --agent to optimize output for AI agents (includes JSON output).

Common commands:

| Command | What it does |
| :--- | :--- |
| mux assets create --input-url URL | Create an asset from a URL |
| mux assets create --file video.mp4 | Upload a local file |
| mux assets list | List assets |
| mux assets get ${ASSET_ID} | Get asset details |
| mux assets delete ${ASSET_ID} | Delete an asset |
| mux live-streams create | Create a live stream |
| mux uploads create | Create a direct upload URL |
| mux sign ${PLAYBACK_ID} | Generate a signed playback URL |

Use --wait to block until an asset is ready:


```bash
mux assets create --input-url "https://example.com/video.mp4" --wait --agent
```


For the full list of commands, see the CLI documentation.

Common resources

- Authentication and making API requests — how to authenticate with the Mux API
- Rate limits — API rate limit details
- Full API reference — complete endpoint documentation
- Webhooks guide — listen for events like video.asset.ready
- Mux Player guide — the easiest way to play Mux videos
- Direct uploads guide — let users upload video files from the browser
- Stream video files guide — ingest a video, wait for it to be ready, get a playback URL
- Live streaming guide — set up live streams
- Secure video playback — signed playback for private content
- Static MP4 renditions guide — downloadable MP4/M4A files
- MCP Server — use Mux from AI tools that support MCP
- Docs for LLMs — machine-readable documentation bundles
- OpenAPI spec — full API specification

Instructions for your human

Before you can make API calls, your user needs to set up a Mux account and provide you with API credentials.

1. Sign up for Mux at the Mux dashboard. No credit card is required. The free tier includes enough usage to develop and test.
2. Go to the Mux dashboard, then navigate to Settings → Access Tokens.
3. Create an API access token with all permissions — Mux Video, Mux Data, and System — with read and write access.
4. Save the Access Token ID and Access Token Secret. The secret is only shown once.

Store the credentials as environment variables:


```bash
MUX_TOKEN_ID=your-token-id
MUX_TOKEN_SECRET=your-token-secret
```


For details on how authentication works, see the make API requests guide.

  Never expose API credentials in client-side code. All Mux API calls must be made from a server.

Two main ways to use Mux

Website embed

This is for when you have a small, constrained number of videos — a hero video or background video on your homepage, a demo reel, or a few dozen videos across your site. The key characteristic is that the set of videos doesn't change often and is manageable enough to hardcode.

In this case, you can hardcode playback IDs directly in your code or extract them into a JSON config file with metadata:


```json
{
  "videos": [
    { "title": "Hero Video", "playbackId": "TXjw00EgPBPS6acv7gBUEJ14PEr5XNWOe" },
    { "title": "Product Demo", "playbackId": "a4nOgR00sKz6cMWLeM5skT8ePBn7U6gC5" }
  ]
}
```


Then use Mux Player to embed each video:


```jsx
import MuxPlayer from '@mux/mux-player-react';

<MuxPlayer playbackId="TXjw00EgPBPS6acv7gBUEJ14PEr5XNWOe" />
```


To create your assets and get playback IDs, use the CLI (mux assets create --input-url URL --wait --json) or the stream video files guide.

User uploaded

This is for when videos are uploaded dynamically as part of your application. Common scenarios include:

- Admin-managed content — an admin area where authorized users upload and manage videos (e.g., a course platform, media library, or CMS)
- User-generated content (UGC) — end users upload their own videos (e.g., a social platform, portfolio site, or community forum)
- Programmatic ingestion — videos are created automatically from external sources or pipelines

For these use cases, you will need to:

1. Accept uploads — use direct uploads to let users upload video files from the browser, or create assets server-side from URLs using the stream video files guide
2. Listen for events — use webhooks to know when a video is ready for playback (video.asset.ready), when it errors, or when it's deleted
3. Persist video data — store asset IDs, playback IDs, status, and metadata in your database (see Persisting Mux data below)
4. Play videos — use Mux Player with the stored playback ID

SDKs

Official server-side SDKs:

| Language | Package | Docs |
| :--- | :--- | :--- |
| Node.js | @mux/mux-node | Guide |
| Python | mux_python | Guide |
| Ruby | mux_ruby | Guide |
| PHP | mux-php | Guide |
| Go | mux-go | GitHub |
| Java | com.mux:mux-sdk-java | Guide |
| C| Mux.Csharp.Sdk | Guide |
| Elixir | mux | Guide |

Sensible defaults

Unless the user specifies otherwise, use these values:

| Parameter | Default to use | Notes |
| :--- | :--- | :--- |
| playback_policy | ["public"] | Use "signed" only if the user needs secure/private playback |
| video_quality | "basic" | No encoding costs and great for most use cases. Use "plus" if the user needs higher quality encoding |
| static_renditions | Do not set | Only set if the user explicitly needs downloadable MP4/M4A files. See the static renditions guide |
| max_resolution_tier | Do not set | Defaults to 1080p. Set to "2160p" only if the user requests 4K |

Cross-references for defaults

- playback_policy: "public" allows open access. Use "signed" for secure video playback with signed JWTs.
- video_quality: See pricing for the difference between "basic" and "plus".
- static_renditions: Replaces the deprecated mp4_support parameter. Use [{ "resolution": "highest" }] for an MP4 download or [{ "resolution": "audio-only" }] for an M4A file. See the static renditions guide for all options.

Persisting Mux data

After creating an asset, save the relevant data into your database or persistence layer. At minimum, store the asset ID and playback ID. You will also want to save metadata as it becomes available: status, duration, aspect_ratio, resolution_tier, and any static_renditions information.

For simple integrations with a fixed set of videos — hero videos, background videos, demo reels on a marketing site — you can hardcode playback IDs in a JSON file or config object. These rarely change and don't need a database.

For production applications where users upload videos, videos are created programmatically, or the video catalog changes over time, always persist asset data in a database. Use webhooks to keep your database in sync — listen for video.asset.ready to update status, and video.asset.deleted to clean up records.

IDs reference

| ID type | What it's for |
| :--- | :--- |
| Asset ID | Managing the asset (get, update, delete) via api.mux.com |
| Playback ID | Streaming the video via stream.mux.com |
| Upload ID | Tracking direct upload status |
| Stream Key | Broadcasting to a live stream (keep secret) |
| Live Stream ID | Managing the live stream via api.mux.com |

Common mistakes

Do NOT confuse Asset IDs with Playback IDs. Asset IDs are for API operations (api.mux.com). Playback IDs are for streaming (stream.mux.com). They are different strings.

Do NOT use the playback URL before the asset is ready. Always check status === "ready" first. A playback URL for a preparing asset will not work.

Do NOT construct playback URLs with the Asset ID. The correct URL is https://stream.mux.com/{PLAYBACK_ID}.m3u8, not https://stream.mux.com/{ASSET_ID}.m3u8.

Do NOT expose API keys in client-side code. API credentials (Token ID and Token Secret) must never be included in frontend JavaScript, mobile apps, or any code that runs on the user's device. All Mux API requests must be made from a trusted server.

Do NOT expose stream keys in client-side code. Stream keys allow anyone to broadcast to your live stream. Keep them server-side only.

Do NOT hardcode playback URLs. Always construct them from the playback ID returned by the API.

Do NOT poll more than once per second. The API has rate limits. Poll every 2 seconds for asset status.

Do NOT use POST endpoints at high volume without backoff. POST requests are rate limited to ~1 request per second sustained. GET requests allow ~5 per second.
