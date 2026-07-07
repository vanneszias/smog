# Start live streaming

**Source:** https://mux.com/docs/_guides/developer/start-live-streaming

Whether you’re looking to build “Twitch for X”, online classrooms, a news & sports broadcasting platform or something the world’s never seen before, the Mux Live Streaming API  makes it easy to build live video into your own software. With a simple API call you get everything you need to push a live stream and play it back at high quality for a global audience.

  For a guided example of how to make API Requests from your local environment, see the guide and watch this video tutorial:  Make API Requests.

The Mux Video API uses a token key pair that consists of a Token ID and Token Secret for authentication. If you haven't already, generate a new Access Token in the Access Token settings of your Mux account dashboard.

The access token should have Mux Video Read and Write permissions.

Access Tokens also belong to an Environment. Be sure to use the same Environment when using Mux Video and Mux Data together, so the data from Mux Data can be used to optimize your Mux Video streams.

Detailed API reference

The Live Stream object in the Mux API is a record of a live stream of video that will be pushed to Mux. To create your first Live Stream, POST request to the /live-streams endpoint.

You can either replace ${MUX_TOKEN_ID} and ${MUX_TOKEN_SECRET} with your own access token details or make sure to export those environment variables with the correct values first.

<CodeExamples
  product="video"
  example="createLiveStream"
/>

The response will include a Playback ID and a Stream Key.

- Playback IDs for a Live Stream can be used the same way as Playback IDs for an Asset. You can use it to play video, get images from a video or build timeline hover previews with your player.
- The Stream Key is a secret that can be used along with Mux's RTMP Server URL (see table below) to configure RTMP streaming software.

  The Stream Key should be treated as a private key for live streaming. Anyone with the key can use it to stream video to the Live Stream it belongs to, so make sure your users know to keep it safe. If you lose control of a stream key, you can either delete the Live Stream or reset the stream key


```json
{
  "data": {
    "id": "QrikEQpEXp3RvklQSHyHSYOakQkXlRId",
    "stream_key": "super-secret-stream-key",
    "status": "idle",
    "playback_ids": [
      {
        "policy": "public",
        "id": "OJxPwQuByldIr02VfoXDdX6Ynl01MTgC8w02"
      }
    ],
    "created_at": "1527110899"
  }
}
```


Mux also allows you to set a few additional options on your live stream. When enabled, you can support more use cases.

| Option | Description |
|--------|-------------|
| "latency_mode": "reduced" | Mux live streams have an option for "reduced latency". When "latency_mode": "reduced" is enabled, we treat your stream a little differently to minimize glass-to-glass latency. The latency reduces to about 10-15 seconds compared to 30 seconds typically without enabling this option. For more details, please refer to the Live Stream Latency guide. |
| "latency_mode": "low" | Similar to "reduced" latency option, "latency_mode": "low" live streams reduce the glass-to-glass latency to as low as 5 seconds but the latency can vary depending on your viewer's geographical location and internet connectivity. For more details, please refer to the Live Stream Latency guide. |
| audio_only | Mux live streams is ready for Audio specific use cases too. For example, you can host Live Podcasts or broadcast Radio Shows. When audio_only is enabled, we only process the audio track, even dropping the video track if broadcast. |

A live stream can only be configured as "reduced latency" or "low latency" or standard latency.

You can find more details about the options on the Create Live Stream.

Mux supports live streaming using the RTMP protocol, which is supported by most broadcast software/hardware as well as open source software for mobile applications.

Your users or your client app will need software that can push an RTMP stream. That software will be configured using the Stream Key from the prior step along with Mux's RTMP Server URL. Mux supports both RTMP and RTMPS:

| RTMP Server URL |  Description | Common Applications |
|---|---|---|
| rtmp://global-live.mux.com:5222/app | Mux's standard RTMP entry point. Compatible with the majority of streaming applications and services. |Open Source RTMP SDKs, most app-store streaming applications. |
| rtmps://global-live.mux.com:443/app | Mux's secure RTMPS entry point. Compatible with less streaming applications, but offers a higher level of security. | OBS, Wirecast, Streamaxia RTMP SDKs |

Learn more about:
 Additional regional ingest URLs for when you want control over the geographic region receiving your user's livestream
 How to configure broadcast software for when users will be using their own streaming software, e.g. Twitch live streamers
* How to live stream from a mobile app for when users will live stream using your mobile app

  Mux's RTMP server URL uses port number 5222 and not the standard RTMP port number 1935.  If your encoder does not provide a method to change the port number, please contact our support team with your encoder details.

Mux Video also supports Secure Reliable Transport (SRT) for receiving live streams. If you want to live stream with a protocol other than RTMP or SRT, let us know!

The broadcast software will describe how to start and stop an RTMP session. Once the session begins, the software will start pushing live video to Mux and the Live Stream will change its status to active indicating it is receiving the RTMP stream and is playable using the Playback ID.

Broadcasting Webhooks

When a Streamer begins sending video and the Live Stream changes status, your application can respond by using Webhooks. There are a few related events that Mux will send. Your application may benefit from some or none of these events, depending on the specific user experience you want to provide.

| Event | Description |
|-------|-------------|
| video.live_stream.connected | The Streamer's broadcasting software/hardware has successfully connected with Mux servers. Video is not yet being recorded and is not yet playable. |
| video.live_stream.disconnected | The Streamer's broadcasting software/hardware has disconnected from Mux servers, either intentionally or unintentionally because of a network drop. |
| video.live_stream.recording | Video is being recorded and prepared for playback. The recording of the live stream (the Active Asset) will include video sent after this point. If your UI has a red "recording" light, this would be the event that turns it on. |
| video.live_stream.active | The Live Stream is now playable using the Live Stream's Playback ID or the Active Asset's Playback ID |
| video.live_stream.idle | The Streamer's broadcasting software/hardware previously disconnected from Mux servers and the reconnect_window has now expired. The recording of the live stream (the Active Asset) will now be considered complete. The next time video is streamed using the same Stream Key it will create a new Asset for the recording. |
| video.asset.live_stream_completed | This event is fired by the Active Asset when the Live Stream enters the idle state and the Active Asset is considered complete. The Asset's playback URL will switch to being an "on-demand" (not live) video. |

To play back a live stream, use the PLAYBACK_ID that was returned when you created the Live Stream along with stream.mux.com to create an HTTP Live Streaming (HLS) playback URL.


```
https://stream.mux.com/{PLAYBACK_ID}.m3u8
```


<CodeExamples
  product="video"
  example="hlsPlaybackLive"
  exampleOrder="html,react,embed,swift,android"
/>

See the playback guide for more information about how to integrate with a video player.

After you have everything working integrate Mux Data with your player for monitoring playback performance.

When the Streamer is finished they will stop the broadcast software/hardware, which will disconnect from the Mux servers. After the reconnect_window time (if any) runs out, the Live Stream will transition to a status of idle.

  Mux automatically disconnects clients after 12 hours. Contact us if you require longer live streams.

After you have live streams created in your Mux environment, you may find some of these other endpoints handy:

- Create a live stream
- List live streams
- Retrieve a live stream
- Delete a live stream
- Create a live stream playback ID
- Delete a live stream playback ID
- Reset a stream key for a live stream
- Signal a live stream is finished
- Disable a live stream
- Enable a live stream
- Create a live stream simulcast target
- Delete a live stream simulcast target
- Retrieve a live stream simulcast target

More Video methods and descriptions are available at the API Docs.

  <GuideCard
    title="Play your live stream"
    description="Set up your iOS application, Android application or web application to start playing your Mux assets"
    links={[
      {title: "Read the guide", href: "/docs/guides/play-your-videos"},
    ]}
  />
  <GuideCard
    title="Integrate Mux Data"
    description="Add the Mux Data SDK to your player and start collecting playback performance metrics."
    links={[
      {title: "Read the guide", href: "/docs/guides/track-your-video-performance"},
    ]}
  />
