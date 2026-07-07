# Use SRT to live stream

**Source:** https://mux.com/docs/_guides/developer/use-srt-to-live-stream

SRT is a modern, common alternative to RTMP and is designed for high-quality, reliable point-to-point video transmission over unreliable networks.

The Mux Video SRT feature also supports using HEVC (h.265) as the live stream input codec, reducing inbound bitrate requirements.

SRT is supported by a wide range of free and commercial video encoders.

Authentication for SRT is a little different than with RTMP, and requires two pieces of information:

1. streamid This is the same stream_key attribute you know & love from RTMP
2. passphrase This is a new piece of information exposed in the Live Streams API called srt_passphrase. You'll need to use this when your encoder asks you for a passphrase.

All new and existing live streams now expose the srt_passphrase field.

You can get this field through the API using the Get Live Stream API call:


```json
// GET https://api.mux.com/video/v1/live-streams/{LIVE_STREAM_ID}
{
  // [...]
  "stream_key": "abc-123-def-456",
  "srt_passphrase": "GHI789JKL101112",
  // [...]
}
```


You can also see the SRT connection details from the dashboard of any live stream:

Configure your encoder

Depending on the encoder you're using, the exact path to setting the SRT configuration will vary.

Some encoders accept all configuration parameters in the form of an SRT URL, in which case you'll need to construct an SRT URL as below, substituting the stream_key and srt_passphrase.


```
srt://global-live.mux.com:6001?streamid={stream_key}&passphrase={srt_passphrase}
```


Mux's global SRT ingest urls will connect you to the closest ingest region. While these ingest URLs typically provide optimal performance, you can also select a specific region using our regional ingest URLs..

Common Configuration values

Other encoders will break out the SRT configuration as multiple fields, you should fill them out as below:

| Field | Value |
| --- | --- |
| Hostname / URL / Port | srt://global-live.mux.com:6001 |
| Stream ID | Use the stream_key from your live stream. |
| Passphrase | Use the srt_passphrase field from your live stream. |
| Mode | Should be set to caller if required. |
| Encryption Key Size / Length | Set to 128 if expressed as “bits”, or 16 if expressed as “pbkeylen” |

Tuning

You may need some of the tuning settings below.

| Field | Value | Notes |
| --- | --- | --- |
| Latency | 500 is generally a safe starting value | Set to at least 4 x the RTT to global-live.mux.com  |
| Bandwidth | 25% is generally a safe starting value | Set to the percentage of overhead you have available in your internet connection for bursts of retransmission. For example, if you have a 5Mbps internet connection, and you set your encoder's target bitrate to 4Mbps, a value of 25% would be appropriate, as it would allow the encoder to burst to 5Mbps for retransmission purposes. |

Stream!

If you've configured your encoder correctly, you should be all set to connect your encoder and start streaming. You can then check you see the live stream in your Mux Dashboard.

You will see all the usual state transitions, events, and webhooks that you'd expect when connecting from an RTMP source.

Example Encoder Configuration

OBS

OBS accepts the SRT endpoint as a single URL, and should be structured as shown below:

_Stream Key should be left empty as both the Stream ID and the Passphrase are being set in the URL field._

Videon

Videon encoders need each parameter to be configured separately, as shown below:

Wirecast

Wirecast needs each parameter to be configured separately, as shown below:

Larix Broadcaster on iOS and Android

Larix Broadcaster also needs each parameter to be configured separately, as shown below:

FFmpeg

FFmpeg takes an SRT URL with the parameters on the URL, for example:


```shell
ffmpeg \
  -f lavfi -re -i testsrc=size=1920x1080:rate=30 \
  -f lavfi -i "sine=frequency=1000:duration=3600" \
  -c:v libx264 -x264-params keyint=120:scenecut=0 \
  -preset superfast -b:v 5M -maxrate 6M -bufsize 3M -threads 4 \
  -c:a aac \
  -f mpegts 'srt://global-live.mux.com:6001?streamid={stream_key}&passphrase={srt_passphrase}'
```


Gstreamer

Gstreamer takes an SRT URL with the parameters on the URL, for example:


```shell
gst-launch-1.0 -v videotestsrc ! queue ! video/x-raw, height=1080, width=1920 \
  ! videoconvert ! x264enc tune=zerolatency ! video/x-h264, profile=main \
  ! ts. audiotestsrc ! queue ! avenc_aac ! mpegtsmux name=ts \
  ! srtsink uri='srt://global-live.mux.com:6001?streamid={stream_key}&passphrase={srt_passphrase}'
```


When sending a live stream for ingest over SRT, Mux supports HEVC (h.265) as the contribution codec.

Using HEVC generally allows you to reduce the inbound bitrate of your live stream without sacrificing quality. The amount you can reduce the bitrate by will vary depending on the encoder that you're using, but generally this would be between 30% and 50%.

You can also now simulcast to SRT destinations for streams that are sent to Mux over SRT.

You can also simulcast streams that were sent over SRT to RTMP destinations.

To configure a simulcast destination as SRT, you can simply pass the SRT URL in the url field when creating a Simulcast Target, as shown below:


```json
POST /video/v1/live-streams/{LIVE_STREAM_ID}/simulcast-targets

{
  "url" : "srt://my-srt-server.example.com:6001?streamid=streamid&passphrase=passphrase",
  "passthrough" : "My SRT Destination"
}
```


Simulcasting and HEVC over SRT

When simulcasting an inbound SRT stream sent over HEVC, Mux does not currently transcode the output stream, so you need to be confident that the simulcast destination supports the HEVC codec.

Below is a current list of the codecs and protocols supported by common simulcast destinations:

| Platform | Protocols | Codecs |
| --- | --- | --- |
| Facebook | RTMP(S) | h.264 |
| X (Twitter) | RTMP(S), HLS Pull | h.264 |
| YouTube | RTMP(S), HLS Pull, SRT (Closed Beta) | h.264, HEVC, AV1 |
| Twitch / IVS | RTMP(S) | h.264 |

Simulcast retains source codec

See simulcasting notes above.

Cross-protocol and cross-codec reconnects

We do not support switching ingest protocols or codecs within a reconnect window.  If you want to reuse the same Live Stream with different protocols you'll need to wait for the reconnect period to expire or call the Complete Live Stream API.

Embedded Captions

Embedded captions (608) are not supported. Auto-generated captions can be used with SRT live streams.

Multi-track audio

While we support multiple audio tracks in an SRT stream, we recommend against sending more than one, as there's no mechanism to configure which will be used. Mux will choose the first audio stream listed in the PMT; other audio streams will be dropped.

Feedback

We'd love to hear your feedback as you use SRT. If you run into issues or have feedback, please contact Mux Support, and we'll get back to you.
