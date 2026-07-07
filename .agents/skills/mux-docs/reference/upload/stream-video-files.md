# Stream videos in five minutes

**Source:** https://mux.com/docs/_guides/core/stream-video-files

The Mux Video API uses a token key pair that consists of a Token ID and Token Secret for authentication. If you haven't already, generate a new Access Token in the Access Token settings of your Mux account dashboard.

You'll be presented with a form to create your new Access Token.

- Access Tokens belong to an Environment — a container for the various Access Tokens, Signing Keys, and assets that you'll come to add to Mux. For this guide, you can keep the Production environment selected.
- Access Tokens can have varying permissions to control what kinds of changes they have the ability to make. For this guide, your Access Token should have Mux Video Read and Write permissions.
- You can give your Access Token an internal-only name like "Onboarding" so you know where you've used it within your application.

Now, click the Generate token button.

You'll be presented with your new Access Token ID and Secret Key.

Once you have your new Access Token ID and Secret Key, you're ready to upload your first video.

<LinkedHeader
  step={steps[1]}
  apiRef={{ href: "/docs/api-reference/video/assets/create-asset" }}
/>

Videos stored in Mux are called assets. To create your first video asset, you need to send a POST request to the /assets endpoint and set the input value to the URL of a video file that's accessible online.

Here are a few demo videos you can use that are stored on common cloud storage services:

- Amazon S3: https://muxed.s3.amazonaws.com/leds.mp4
- Google Drive: https://drive.google.com/uc?id=13ODlJ-Dxrd7aJ7jy6lsz3bwyVW-ncb3v
- Dropbox: https://www.dropbox.com/scl/fi/l2sm1zyk6pydtosk3ovwo/get-started.mp4?rlkey=qjb34b0b7wgjbs5xj9vn4yevt&dl=0

To start making API requests to Mux, you might want to install one of our officially supported API SDKs. These are lightweight wrapper libraries that use your API credentials to make authenticated HTTP requests to the Mux API.

<CodeExamples
  product="video"
  example="installSdk"
/>

  For an example of how to make API Requests from your local environment, see the Make API Requests guide.

<CodeExamples
  product="video"
  example="createAsset"
/>

The response will include an Asset ID and a Playback ID.

- Asset IDs are used to manage assets using api.mux.com (e.g. to read or delete an asset).
- Playback IDs are used to stream an asset to a video player through stream.mux.com. You can add multiple playback IDs to an asset to create playback URLs with different viewing permissions, and you can delete playback IDs to remove access without deleting the asset.


```json
{
  "data": {
    "status": "preparing",
    "playback_ids": [
      {
        "policy": "public",
        "id": "TXjw00EgPBPS6acv7gBUEJ14PEr5XNWOe"
      }
    ],
    "video_quality": "basic",
    "mp4_support": "none",
    "master_access": "none",
    "id": "01itgOBvgjAbES7Inwvu4kEBtsQ44HFL6",
    "created_at": "1607876845"
  }
}
```


  Mux does not store the original file in its exact form, so if your original quality files are important to you, don't delete them after submitting them to Mux.

<LinkedHeader
  step={steps[2]}
  apiRef={{ href: "/docs/api-reference/video/assets/get-asset" }}
/>

As soon as you make the POST request, Mux begins downloading and processing the video. For shorter files, this often takes just a few seconds. Very large files over poor connections may take a few minutes (or longer).

When the video is ready for playback, the asset status changes to ready. You should wait until the asset status is ready before you attempt to play the video.

The best way to be notified of asset status updates is via webhooks. Mux can send a webhook notification as soon as the asset is ready. See the webhooks guide for details.

If you can't use webhooks for some reason, you can manually poll the asset API to see asset status. Note that this only works at low volume. Try this example:

Try an example request

<CodeExamples
  product="video"
  example="retrieveAsset"
/>

Please don't poll this API more than once per second.

To play back an asset, create a playback URL using the PLAYBACK_ID you received when you created the asset.


```curl
https://stream.mux.com/{PLAYBACK_ID}.m3u8
```


Preview in a player

<CodeExamples
  product="video"
  example="hlsPlayback"
  exampleOrder="html,react,embed,swift,android"
/>

See the playback guide for more information about how to integrate with a video player.

Preview with stream.new

Stream.new is an open source project by Mux that allows you to add a video and get a shareable link to stream it.

Go to stream.new/v/{PLAYBACK_ID} to preview your video streaming. This URL is shareable and automatically generated using the video playback ID. Copy the link below and open it in a browser to view your video.


```
https://stream.new/v/{PLAYBACK_ID}
```


After you have everything working integrate Mux Data with your player for monitoring playback performance.

After you have assets created in your Mux environment, you may find some of these other endpoints handy:

- Create an asset
- List assets
- Retrieve an asset
- Delete an asset
- Retrieve asset input info
- Create asset playback ID
- Retrieve asset playback ID
- Delete asset playback ID
- Update MP4 support on asset
- Update master access on asset
- Update asset track
- Delete an asset track

More Video methods and descriptions are available at the API Docs.

Next Steps

  <GuideCard
    title="Play your videos"
    description="Set up your iOS application, Android application or web application to start playing your Mux assets"
    links={[
      {title: "Read the guide", href: "/docs/guides/play-your-videos"},
    ]}
  />
  <GuideCard
    title="Preview your video"
    description="Now that you have Mux assets, build rich experiences into your application by previewing your videos with Thumbnails and Storyboards"
    links={[
      {title: "Read the guide", href: "/docs/guides/get-images-from-a-video"},
    ]}
  />
  <GuideCard
    title="Integrate Mux Data"
    description="Add the Mux Data SDK to your player and start collecting playback performance metrics."
    links={[
      {title: "Read the guide", href: "/docs/guides/track-your-video-performance"},
    ]}
  />
