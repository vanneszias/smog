# Stream simulated live

**Source:** https://mux.com/docs/_guides/developer/stream-simulated-live

- Pre-Recorded Live
  - Scheduled Live
  - Playout Service
  - Simulated Live from VOD
  - Psuedo-live
  - Live Linear Channel

You may have a pre-recorded video and want to use Mux to broadcast it as if it were live.

For now, Mux does not support Simulated Live streaming directly as a feature. As a work-around, this guide provides a few options to implement your own Simulated Live streaming solution.

Simulated Live streaming is a common strategy to ensure reliability. For example, if your platform has groups of users watching content simultaneously, you will want to employ one of the following strategies.

  You should be familiar with how live streaming works:
  1. Create a live stream with the Mux API
  2. Get the unique stream key for that live stream
  3. Put the server URL and stream key into an encoder (OBS, Wirecast, etc.)
  4. Use the Playback ID to view your live stream in any player that supports HLS

The most straightforward and reliable option we recommend is to use a third party service built for Simulated Live streaming. The service will allow you to upload videos and send out an RTMP stream at a scheduled time.

Upload your video to the service, enter in the Mux rtmp ingest server details, and schedule the time you want it to "go live".

For example, restream.io supports streaming pre-recorded videos. Note that there is a cost associated with this option.

The second option we recommend is to build your own server that is capable of uploading video and sending an RTMP stream to Mux.

To do this, run encoder software that can ingest a video file and sends output to a Mux RTMP ingest URL. Software you might use to build a server include ffmpeg or GStreamer.

If you are going with this "home-rolling" route, your program should:

- Handle network blips gracefully. Even if your server is running in a reliable cloud like AWS or Google, networking between commercial data centers may experience interruptions.

- Handle disconnects. In particular, ffmpeg does not have any built in disconnect handling so if you use that software you should make sure you have a solution to handle them.

- Hold up to rigorous testing. Test the program with different types of content and long running streams. Make sure what you built is reliable before you use it in production.

The final option is to skip the backend live streaming setup, use an on-demand video, and make it "appear live" in your UI. This is a work-around we have seen success with.

To simulate a Live Stream in the UI you could:

- Hide the timeline of the player so that users can't seek back and forth
- Have the client make requests to the server to check server-time and use the server-time to keep the playhead synced to the "current live" time
- Show a red dot that gives the impression to the user "this is live"

Provide your feedback

We'd love to hear what is working and what isn't working, so if you are using one of these solutions (or some other solution), please send your ideas.

If you are interested in Simulated Live streaming as a Mux feature, let us know about your use case and specific needs!
