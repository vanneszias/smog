# Configure Broadcast Software

**Source:** https://mux.com/docs/_guides/developer/configure-broadcast-software

Overview / configuration term glossary

Most broadcasting software uses some standard set of terms. Mux has chosen a set of terms are very commonly used.

- Server URL - This is the URL of the Mux RTMP server, as listed in the table below.
- Stream Key - The Stream Key is essentially used to authenticate your live stream with the Mux RTMP server. This is your secret key to live streaming. Mux does not use additional authentication.

---

| RTMP Server URL | Description | Common Applications |
| :-- | :-- | :-- |
| rtmp://global-live.mux.com:5222/app | Mux's standard RTMP entry point. Compatible with the majority of streaming applications and services | Open Source RTMP SDKs, most app-store streaming applications |
| rtmps://global-live.mux.com:443/app | Mux's secure RTMPS entry point. Compatible with less streaming applications, but offers a higher level of security | OBS, Wirecast, Streamaxia RTMP SDKs |

---

Here is a list of other terms that we have heard:

- Stream Name - A common alias and the technically correct term (in the RTMP specification) for Stream Key.
- Location or URL - Many times, broadcast software that just asks for a location or a URL wants a combination of the Stream URL and the Stream Key like rtmp://global-live.mux.com:5222/app/{STREAM_KEY}. If location or URL are asked for with a stream name/key, then this is an alias for Server URL.
- FMS URL - Flash Media Server URL, an alias for Server URL.

Seen or heard a term that you don't understand? Ask us! Think we missed something that you know? Leave a comment at the bottom of the page!

Mux's RTMP server URL uses port number 5222 and not the standard RTMP port number 1935. If your encoder does not provide a method to change the port number, please contact support with your encoder details.

Recommended encoder settings

Twitch has a clear and concise guide to broadcast encoder settings. YouTube has a bit more detailed guide as well. Here's a very simple recommendation of where to start, but we do recommend playing with your settings to see what works best for your content:

Common
- Video CODEC - H.264 (Main Profile)
- Audio CODEC - AAC

Great - 1080p 30fps
- Bitrate - 5000 kbps
- Keyframe Interval - 2 seconds

Good - 720p 30fps
- Bitrate - 3500 kbps
- Keyframe Interval - 2 seconds

Works - 480p 30fps
- Bitrate - 1000 kbps
- Keyframe Interval - 5 seconds

You should also consider your available upload bandwidth when choosing an encoder bitrate. For a more reliable connection, we recommend using no more than ~50% of the available upload bandwidth for your live stream ingest.

Alternate ingest protocols

Mux Video also supports Secure Reliable Transport (SRT) for receiving live streams.

Available Ingest URLs

Mux's regional ingest urls let you manually select your ingest region. This may be useful if you notice DNS is not routing your traffic efficiently, or if you would like to manage your own failover process.

| Region | RTMP Ingest URL | SRT Ingest URL |
| :-- | :-- | :-- |
|Global (Auto-Select) | rtmp://global-live.mux.com/app | srt://global-live.mux.com:6001?streamid={STREAM_KEY}&passphrase={SRT_PASSPHRASE} |
|U.S. East | rtmp://us-east.live.mux.com/app | srt://us-east.live.mux.com:6001?streamid={STREAM_KEY}&passphrase={SRT_PASSPHRASE} |
|U.S. West | rtmp://us-west.live.mux.com/app | srt://us-west.live.mux.com:6001?streamid={STREAM_KEY}&passphrase={SRT_PASSPHRASE} |
|Europe	| rtmp://eu-west.live.mux.com/app | srt://eu-west.live.mux.com:6001?streamid={STREAM_KEY}&passphrase={SRT_PASSPHRASE} |

All of these RTMP URLs support RTMPS.

For example, rtmp://us-east.live.mux.com/app becomes rtmps://us-east.live.mux.com/app

Choosing the right ingest URL

- If you want Mux to automatically route to the best region, use global-live.mux.com.
- If you prefer manual control over routing, use a specific regional ingest URL (e.g., us-east.live.mux.com).
- For redundancy, configure your encoder to failover to another regional endpoint.

Using regional ingest URLs in OBS

To set up OBS with Mux Live Streaming:
1. Go to: Settings → Stream
2. Select "Custom..." as the service
3. Enter the Ingest URL based on your preferred region

    rtmps://us-east.live.mux.com/app

4. Enter your Stream Key (found in your Mux Live settings)
5. Click "Start Streaming"

Building your SRT URL

Note: Before you use a SRT URL, make sure your encoder supports SRT Caller mode.

The SRT URL is composed of three parts.

1. The protocol and host: srt://us-east.live.mux.com:6001
2. A streamid query parameter
3. A passphrase query parameter

Here's an example:

```
srt://us-east.live.mux.com:6001?streamid=abc-123-def-456&passphrase=GHI789JKL101112
```


For more information on SRT, check out our Use SRT to live stream docs.

Software encoders

Any encoder that supports RTMP should work with Mux Video.
- OBS (Free and Open Source)
- Wirecast (Commercial)
- XSplit (Commercial)
- vMix (Commercial)

Hardware encoders

Any encoder that supports RTMP should work with Mux Video.
- VidiU
- DataVideo RTMP Encoders
- Magewell Ultra Stream
- Osprey Talon (contact sales@ospreyvideo.com for documentation)
- Videon

Mobile devices (iOS, Android)

If you just want a pre-built iOS application you can stream from, check out our write up here.

If you want to build your own application, check out this documentation.
