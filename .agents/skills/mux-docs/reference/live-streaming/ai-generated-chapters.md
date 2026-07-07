# Generating video chapters with AI

**Source:** https://mux.com/docs/_guides/examples/ai-generated-chapters

This guide uses @mux/ai, our open-source library that provides prebuilt workflows for common video AI tasks. It works with your favorite LLM provider (OpenAI, Anthropic, or Google). Check out the GitHub repository for more details!

If you're using a player that supports visualizing chapters during playback, like Mux Player does, you can automatically generate chapter markers using AI. The @mux/ai library makes this straightforward by handling all the complexity of fetching transcripts, formatting prompts, and parsing AI responses.

Prerequisites

Before starting, make sure you have:
- A Mux account with API credentials (token ID and token secret)
- An API key for your preferred AI provider (OpenAI, Anthropic, or Google)
- Node.js installed
- Videos with captions enabled (human-generated captions are best, but auto-generated captions work great too)

Installation


```bash
npm install @mux/ai
```


Configuration

Set your environment variables:


```bash
# Required
MUX_TOKEN_ID=your_mux_token_id
MUX_TOKEN_SECRET=your_mux_token_secret
# You only need the API key for the provider you're using
OPENAI_API_KEY=your_openai_api_key # OR
ANTHROPIC_API_KEY=your_anthropic_api_key # OR
GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key
```


Basic usage

Backend: Generate chapters


```javascript
import { generateChapters } from "@mux/ai/workflows";

// Generate chapters for a video
const result = await generateChapters("your-mux-asset-id", "en", {
  provider: "openai" // or "anthropic" or "google"
});
```


The function returns chapters in the exact format Mux Player expects:


```json
{
  "chapters": [
    { "startTime": 0, "title": "Introduction" },
    { "startTime": 15, "title": "Setting Up the Live Stream" },
    { "startTime": 29, "title": "Adding Functionality with HTML and JavaScript" },
    { "startTime": 41, "title": "Identifying Favorite Scene for Clipping" }
  ]
}
```


Frontend: Add chapters to player

Once you have the chapters from your backend, you can add them to Mux Player:


```javascript
const player = document.querySelector('mux-player');
player.addChapters(result.chapters);
```


Provider options

@mux/ai supports three AI providers:

- OpenAI (default): Uses gpt-5.1 model - Fast and cost-effective
- Anthropic: Uses claude-sonnet-4-5 model - Great for nuanced understanding
- Google: Uses gemini-3-flash-preview model - Balance of speed and quality

You can override the default model:


```javascript
const result = await generateChapters("your-mux-asset-id", "en", {
  provider: "openai",
  model: "gpt-4o" // Use a different model
});
```


Custom prompts

You can override specific parts of the prompt to tune the output:


```javascript
const result = await generateChapters("your-mux-asset-id", "en", {
  provider: "anthropic",
  promptOverrides: {
    system: "You are a professional video editor. Create concise, engaging chapter titles.",
    instructions: "Generate 5-8 chapters with titles under 50 characters each."
  }
});
```


Webhook integration

For automated chapter generation when videos are uploaded, you should trigger the call to generate chapters from the video.asset.track.ready webhook:


```javascript
export async function handleWebhook(req, res) {
  const event = req.body;

  if (event.type === 'video.asset.track.ready' &&
      event.data.type === 'text' &&
      event.data.language_code === 'en') {
    const result = await generateChapters(event.data.asset_id, "en");
    await db.saveChapters(event.data.asset_id, result.chapters);
  }
}
```


Visualizing in Mux Player

Once you have chapters, you can display them in Mux Player:


```javascript
const player = document.querySelector('mux-player');
player.addChapters(result.chapters);
```


Here's an interactive example:

<InteractiveCodeExample
  product="player"
  example="aiChapters"
/>

How it works

Under the hood, @mux/ai handles:
1. Fetching the video transcript from Mux using the asset ID
2. Formatting the transcript for the AI provider
3. Sending optimized prompts to generate chapter markers
4. Parsing and validating the AI response
5. Converting timestamps to the format Mux Player expects

Mux features used

- Auto-generated captions - @mux/ai fetches these automatically
- Mux Player - For displaying the generated chapters

Best practices

- Enable captions: Human-generated captions provide the best results, but auto-generated captions work great too
- Choose the right provider: OpenAI's gpt-5.1 is cost-effective for most use cases
- Validate output: While @mux/ai validates JSON structure, review chapter quality for your use case
- Cache results: Store generated chapters in your database to avoid regenerating them

Resources

- @mux/ai GitHub Repository
- @mux/ai Workflows Documentation
- Mux Auto-generated Captions
- Mux Player Web Component
