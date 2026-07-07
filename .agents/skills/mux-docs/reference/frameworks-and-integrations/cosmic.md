# Integrate with Cosmic

**Source:** https://mux.com/docs/_guides/integrations/cosmic

1. Install the Mux Extension

Log in to your Cosmic JS account and navigate to Your Bucket > Settings > Extensions. Click the Extensions tab and find the Mux Videos Extension. Hit Install.

2. Enter Mux credentials

After installing, you will be redirected to the Extension settings page. Under Query Parameters, you will need to provide the Mux API credentials on your Mux account (mux_access_token, mux_secret).

If you need to generate a new Access Token, go to the Access Token settings of your Mux account dashboard.

The access token should have Read and Write permissions for Mux Video.

Go back to the Cosmic Extensions setting page, enter your Mux credentials, and save your Extension.

3. Upload video

After installing the Extension and setting your Mux account keys, click the Mux Videos Extension link in the left-hand nav. Next, upload your videos.

The Extension saves the uploaded video data to the Mux Videos Object Type. Now you can add your Mux Videos to any Object using an Object metafield. Then you can fetch Mux data into your application by using the mux_playback_url property located in the Object metadata.

4. Playback

To retrieve your video for playback, check out the Cosmic docs to see how to add the Mux playback URL to your HTML Video player.
