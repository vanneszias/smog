# Use different video quality levels

**Source:** https://mux.com/docs/_guides/developer/use-video-quality-levels

We recently renamed encoding tiers to video quality levels. Read the blog for more details.

Introducing video quality levels

Mux Video supports encoding content with three different video quality levels. The video quality level informs the quality, cost, and available platform features for the asset.

Basic

The basic video quality level uses a reduced encoding ladder, with a lower target video quality, suitable for simpler video use cases.

There is no charge for video encoding when using basic quality.

Plus

The plus video quality level encodes your video at a consistent high-quality level. Assets encoded with the plus quality use an AI-powered per-title encoding technology that boosts bitrates for high-complexity content, ensuring high-quality video, while reducing bitrates for lower-complexity content to save bandwidth without sacrificing on quality.

The plus quality level incurs a cost per video minute of encoding.

Premium

The premium video quality level uses the same AI-powered per-title encoding technology as plus, but is tuned to optimize for the presentation of premium media content, where the highest video quality is required, including use cases like live sports, or studio movies.

The premium quality level incurs a higher cost per video minute of encoding, storage, and delivery.

Set a video quality level when creating an asset

The video quality of an asset is controlled by setting the video_quality attribute on your create-asset API call, so to create an asset with the basic quality level, you should set "video_quality": "basic" as shown below.


```json
// POST /video/v1/assets
{
	"inputs": [
		{
			"url": "https://storage.googleapis.com/muxdemofiles/mux.mp4"
		}
	],
	"playback_policies": [
		"public"
	],
	"video_quality": "basic"
}
```


And of course you can also select the video_quality within Direct Uploads, too; you just need to set the same "video_quality": "basic" field in the new_asset_settings of your create-direct-upload API call.


```json
// POST /video/v1/uploads
{
  "new_asset_settings": {
    "playback_policies": [
      "public"
    ],
    "video_quality": "basic"
  },
  "cors_origin": "*"
}
```


Set the video quality when creating a live stream

To set the video_quality for a live stream, you just need to set the "video_quality" field within the new_asset_settings configuration of your create-live-stream API call to "plus" or "premium", as shown below.


```json
// POST /video/v1/live-streams
{
  "playback_policies": [
    "public"
  ],
  "new_asset_settings": {
    "playback_policies": [
      "public"
    ],
    "video_quality": "plus"
  }
}
```


All on-demand assets created from the live stream will also inherit the given quality level. Live streams can currently only use the plus or premium video quality levels.

Supported features

Assets using different video quality levels have different features or limits available to them. Refer to the below table for more details:

| Feature | Basic | Plus | Premium |
| :-- | :-- | :-- | :-- |
| JIT encoding | ✅ | ✅ | ✅ |
| Multi CDN delivery | ✅ | ✅ | ✅ |
| Mux Data included | ✅ | ✅ | ✅ |
| Mux Player included | ✅ | ✅ | ✅ |
| Thumbnails, Gifs, Storyboards | ✅ | ✅ | ✅ |
| Watermarking | ✅ | ✅ | ✅ |
| Signed playback IDs and playback restrictions | ✅ | ✅ | ✅ |
| On-Demand | ✅ | ✅ | ✅ |
| Master Access | ✅ | ✅  | ✅ |
| Audio-only Assets | ✅ | ✅ | ✅ |
| Auto-generated captions | ✅ | ✅ | ✅ |
| Clipping to a new asset| ✅ | ✅ | ✅ |
| Multi-track audio | ✅ | ✅ | ✅ |
| Live Streaming | ❌ | ✅ |  ✅ |
| Adaptive bitrate ladder | Reduced | Standard | Extended |
| Maximum streaming resolution | 2160p (4K) | 2160p (4K) | 2160p (4K) |
| MP4 support \ | ✅  | ✅ | ✅ |
| DRM  | ❌ | ✅ | ✅ |

Examples for comparison

| Encoding tier | Content complexity | Playback page |
| :-- | :-- | :-- |
| basic | Simple | moodeng - basic |
| basic | Complex | waterfall - basic |
| plus | Simple | moodeng - plus |
| plus | Complex | waterfall - plus |
| premium | Simple | moodeng - premium |
| premium | Complex | waterfall - premium |

\ MP4 pricing depends on the video quality level of your asset. Learn more.
