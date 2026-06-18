# Play your videos

**Source:** https://mux.com/docs/_guides/developer/play-your-videos

Each asset and each live_stream in Mux can have one or more Playback IDs.

This is an example of the "playback_ids" from the body of your asset or live_stream in Mux. In this example, the PLAYBACK_ID is "uNbxnGLKJ00yfbijDO8COxTOyVKT01xpxW" and the policy is "public".

Playback IDs can have a policy of "public" or "signed". For the purposes of this guide we will be working with "public" playback IDs.

If this is your first time using Mux, start out with "public" playback IDs and then read more about securing video playback with signed URLs later.


```json
"playback_ids": [
  {
    "policy": "public",
    "id": "uNbxnGLKJ00yfbijDO8COxTOyVKT01xpxW"
  }
],
```


HLS is a standard protocol for streaming video over the internet. Most of the videos you watch on the internet, both live video and on-demand video is delivered over HLS. Mux delivers your videos in this standard format.

Because HLS is an industry standard, you are free to use any HLS player of your choice when working with Mux Video.

HLS URLs end with the extension .m3u8. Use your PLAYBACK_ID to create an HLS URL like this:


```
https://stream.mux.com/{PLAYBACK_ID}.m3u8
```


If you're curious to learn more about how HLS works you might find this informational site howvideo.works makes for some good bedtime reading.

Other formats

HLS (.m3u8) is used for streaming assets (video on demand) and live streams. For offline viewing and post-production editing take a look at the guide for download your videos which covers mp4 formats and master access.

Most browsers do not support HLS natively in the video element (Safari and IE edge are exceptions). Some JavaScript will be needed in order to support HLS playback in your web application.

The default player in iOS and TVOS (AVPlayer) supports HLS natively, so no extra effort is needed. In the Swift example below we're using the VideoPlayer struct that comes with SwiftUI and AVKit.

Similarly, the default player ExoPlayer on Android also supports HLS natively.

If you're using Next.js or React for your application, the with-mux-video example is a good place to start.

npx create-next-app --example with-mux-video with-mux-video-app

The examples below are meant to be a starting point. You are free to use any player that supports HLS with Mux videos. Here's some popular players that we have seen:

Mux Player

<CodeExamples
  product="video"
  example="muxPlayerQuickstart"
  exampleOrder="html,react,embed"
/>

See the Mux Player guide for more details and configuration options.

Mux Video Element

If Mux Player does more than you're looking for, and you're interested in using something more like the native HTML5 ` element for your web application, take a look at the  element. The Mux Video Element is a drop-in replacement for the HTML5  element, but it works with Mux and has Mux Data automatically configured.

- HTML: Mux Video element
- React: MuxVideo component

Popular web players

 HLS.js is free and open source. This library does not have any UI components like buttons and controls. If you want to either use the HTML5  element's default controls or build your own UI elements HLS.js will be a great choice.
 Plyr.io is free and open source. Plyr has UI elements and controls that work with the underlying  element. Plyr does not support HLS by default, but it can be used _with_ HLS.js. If you like the feel and theming capabilities of Plyr and want to use it with Mux videos, follow the example for using Plyr + HLS.js.
 Video.js is a free and open source player. As of version 7 it supports HLS by default. The underlying HLS engine is videojs/http-streaming.
 JWPlayer is a commercial player and supports HLS by default. The underlying HLS engine is HLS.js.
 Brightcove Player is a commercial player built on Video.js and HLS is supported by default.
 Bitmovin Player is a commercial player and supports HLS by default.
 THEOplayer is a commercial player and supports HLS by default. The player chrome is built on Video.js, but the HLS engine is custom.
 Agnoplay is a fully agnostic, cloud-based player solution for web, iOS and Android with full support for HLS.

Use Video.js with Mux

Video.js kit is a project built on Video.js with additional Mux specific functionality built in.
This includes support for:

- Enabling timeline hover previews
- Mux Data integration
- playback_id helper (we'll figure out the full playback URL for you)

For more details, head over to the Use Video.js with Mux page.

Playback with subtitles/closed captions

Subtitles/Closed Captions text tracks can be added to an asset either on asset creation or later when they are available. Mux supports SubRip Text (SRT) and Web Video Text Tracks format for ingesting Subtitles and Closed Captions text tracks. For more information on Subtitles/Closed Captions, see this blog post and the guide for subtitles.

Mux includes Subtitles/Closed Captions text tracks in HLS (.m3u8) for playback. Video Players show the presence of Subtitles/Closed Captions text tracks and the languages available as an option to enable/disable and to select a language. The player can also default to the viewer's device preferences.

If you are adding text tracks to your Mux videos, make sure you test them out with your player.

In addition, Mux also supports downloading of Subtitles/Closed Captions text tracks as "sidecar" files when downloading your videos.


```
https://stream.mux.com/{PLAYBACK_ID}/text/{TRACK_ID}.vtt
```


Replace {PLAYBACK_ID} with your asset's playback ID and {TRACK_ID} with the unique identifier value returned when this subtitle/closed caption text track was added to this asset.

Add delivery redundancy with Redundant Streams

Mux Video streams are delivered using multiple CDNs. The best performing CDN is selected for the viewer initiating the playback. Video is then streamed by that CDN for that particular user. When the selected CDN has a transient or regional failure, the viewer's playback experience could be interrupted for the duration of the failure. If this happens your application should handle the playback failure and re-initiate the playback session. Mux Video's CDN selection logic would then select a different CDN for streaming.

The redundant streams modifier allows Mux to list each rendition for every CDN in the HLS manifest. The order is based on CDN performance with the best performing one listed first. If your video player supports redundant streams then the player will detect the failure mid-playback and switch to the next CDN on the list during a failure without interrupting the playback.

For more information on the Redundant Streams playback modifier and player support based on our tests, see this blog post.

To use this feature in your application add redundant_streams=true to the HLS URL:


```none
https://stream.mux.com/{PLAYBACK_ID}.m3u8?redundant_streams=true
```


Using redundant_streams with signed URLs

If you are using signed playback URLs make sure you include the extra parameter in your signed token.

This table shows the support of various video players for redundant streams. This table will be updated as more players are tested or updated. If your player isn't listed here, please reach out.

| Player | Version | Manifest 4xx | Manifest 5xx | Media 4xx | Media 5xx |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Video.js | >= 7.6.6 |✅ |✅ |✅ |✅ |
| HLS.js | >= 0.14.11 |✅ |✅ |✅ |✅ |
| JWPlayer | Production Release Channel |✅ |✅ |✅ |✅ |
| Safari iOS (AVPlayer) | >= iOS 13.6.1 |✅ |✅ |✅ |✅ |
| Safari MacOS | Safari >= 13.1.2 MacOS 10.15.X |✅ |✅ |✅ |✅ |
| ExoPlayer | >= r2.12.0 |✅ |✅ |✅ |✅ |

Securing video playback

When using a policy of "public" for your playback IDs, your HLS playback URLs will work for as long as the playback ID exists. If you use a "signed"` policy then you can have more control over playback access. This involves creating signing keys and using JSON web tokens to generate signatures on your server. See the guide for secure video playback.

  <GuideCard
    title="Get images from a video"
    description="Now that you have playback working, build rich experiences into your application by previewing your videos with thumbnails and gifs."
    links={[
      {title: "Read the guide", href: "/docs/guides/get-images-from-a-video"},
    ]}
  />
  <GuideCard
    title="Track your video performance"
    description="Add the Mux Data SDK to your player and start collecting playback performance metrics."
    links={[
      {title: "Read the guide", href: "/docs/guides/track-your-video-performance"},
    ]}
  />
