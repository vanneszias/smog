# Stream live to 3rd party platforms

**Source:** https://mux.com/docs/_guides/developer/stream-live-to-3rd-party-platforms

With the Simulcasting feature, developers can enable their users publish live streams on social platforms.

The Mux Video API makes it easy for developers to build live streaming into their applications. Combined with simulcasting, existing features like Persistent Stream Keys and Automatic Live Stream Recording together provide a way to connect with a number of social sharing apps.

What Simulcasting can help you do:
 Forward a live stream on to social networks like YouTube, Facebook, and Twitch
 Let users publish user-generated live streams on social platforms
 Connect with a number of social sharing apps

Other domains may use varying terminology to refer to the same general process including:

 Restreaming
 Live Syndication
 Rebroadcasting
 RTMP Passthrough
 Multistreams - a term used by Crowdcast

Mux Simulcasting works with any arbitrary RTMP server. That means Mux will support Simulcast Targets from any platform that supports the RTMP or RTMPS protocol.

Targets that are supported include but are not limited to the following:
 Facebook Live
 YouTube Live
 Twitch
 Crowdcast
 Vimeo

Unfortunately the following Targets are not supported:
 Instagram (you can only go live from the Instagram app)

Use the Mux API to add simulcasting to a live stream.

The first step is to add a Simulcasting Target. You can do this when the Live Stream object is first created, or anytime afterward. Note that Simulcast Targets can only be added while the Live Stream object is not active.

Here is an example of adding a Simulcasting Target for each additional platform the stream should be published to:


```text
POST https://api.mux.com/video/v1/live-streams
```



```text
{
  "playback_policies": [
    "public"
  ],
  "new_asset_settings": {
    "playback_policies": [
      "public"
    ]
  },
  "simulcast_targets" : [
    {
      "url" : "rtmp://a.rtmp.youtube.com/live2",
      "stream_key" : "12345",
      "passthrough" : "YouTube Example"
    },
    {
      "url" : "rtmps://live-api-s.facebook.com:443/rtmp/",
      "stream_key" : "12345",
      "passthrough" : "Facebook Example"
    }
  ]
}
```


As defined in the Simulcast Targets API reference, RTMP credentials consist of two parts:
 a url , which is the RTMP hostname including the application name for the third party live streaming service
 a stream_key, which is the password that represents a stream identifier for the third party live streaming service to simulcast the parent live stream to.

Note that stream keys are sensitive and should be treated with caution the same way you would with an API key or a password.

New to live streaming? In this blog post we provide a step-by-step outline how to use Twitch, YouTube, or Facebook for getting RTMP credentials.

Not sure what settings to use?
As for settings, a recommendation for your end users is 4,000 kbps at 720p resolution with 2s keyframe intervals. However, this post also provides an in-depth explanation for choosing personalized settings.

Help Your Users be in 5 Places at Once: Your Guide to Simulcasting

Pricing

Simulcasting has an added cost on top of live streaming, but like all of our pricing, you only pay for what you use.

See the Pricing Page for details.

Availability

There's a limit of 6 simulcasts/restreams per live stream. Let us know if you have a use case that requires more.

Blog Posts about Simulcasting

We have several blog posts that cover more topics about simulcasting products, if you want to read more:

 Seeing double? Let your users simulcast (aka restream) to any social platform
 Help Your Users be in 5 Places at Once: Your Guide to Simulcasting
