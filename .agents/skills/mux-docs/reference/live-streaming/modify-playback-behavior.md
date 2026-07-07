# Modify playback behavior

**Source:** https://mux.com/docs/_guides/developer/modify-playback-behavior

Playback modifiers are optional parameters added to the video playback URL. These modifiers allow you to change the behavior of the stream you receive from Mux.

Mux Video supports 2 different types of playback policies: public and signed. Playback modifiers are supported for both types of playback policies. However, the method to add them differs.

Query String with public playback URL

```text
https://stream.mux.com/{PLAYBACK_ID}.m3u8?{MODIFIER_NAME}={MODIFIER_VALUE}
```

Replace PLAYBACK_ID with your asset's public policy playback ID. Replace MODIFIER_NAME and MODIFIER_VALUE with any of the supported modifiers listed below in this document.

JWT Claim with signed playback URL


```text
https://stream.mux.com/{PLAYBACK_ID}.m3u8?token={TOKEN}
```

Replace PLAYBACK_ID with your asset's signed policy playback ID and TOKEN with the signature generated. Add modifiers to your claims body in the JWT payload. View the guide for Secure video playback for details about adding query parameters to signed tokens.

Availiable playback modifiers

| Modifier | Availiable Values | Default Value | Description |
| :-- | :-- | :-- | :-- |
| redundant_streams | true, false | false | Includes HLS redundant in the stream's manifest. See the Play your videos guide. |
| roku_trick_play | true, false | false | Adds support for timeline hover previews on Roku devices. See the Create timeline hover previews guide.
| default_subtitles_lang | A BCP47 compliant language code | none | Sets which subtitles/captions language should be set as the default. See the Subtitles guide guide.
| max_resolution| 270p, 360p, 480p, 540p, 720p, 1080p, 1440p, 2160p | none | Sets the maximum resolution of renditions included in the manifest. See the Control playback resolution guide.|
| min_resolution| 270p, 360p, 480p, 540p, 720p, 1080p, 1440p, 2160p | none | Sets the minimum resolution of renditions included in the manifest. See the Control playback resolution guide. |
| rendition_order| desc | Automatically ordered by Mux's internal logic. | Sets the logic to order renditions by in the HLS manifest. See the blog post.|
| program_start_time | An epoch timestamp | none | Sets the start time of the asset created from a live stream or live stream when using the instant clipping feature. |
| program_end_time | An epoch timestamp | none | Sets the end time of the asset created from a live stream or live stream when using the instant clipping feature. |
| asset_start_time | Time (in seconds) | none | Sets the relative start time of the asset when using the instant clipping feature. |
| asset_end_time | Time (in seconds) | none | Sets the relative end time of the asset when using the instant clipping feature. |
