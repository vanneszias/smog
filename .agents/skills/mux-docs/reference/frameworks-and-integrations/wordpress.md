# Integrate with WordPress

**Source:** https://mux.com/docs/_guides/integrations/wordpress

This guide explains how to integrate Mux with WordPress using the Mux Video Uploader plugin by 2Coders. This integration enables you to leverage Mux's powerful video infrastructure while maintaining the familiar WordPress content management experience.

Follow the steps below to integrate Mux with your WordPress site

1. Install the Plugin

WordPress plugin can be installed either from WordPress Plugin Directory or Manually by uploading a zipped plugin file.

You should be on WordPress.com Business pricing plan or higher to install the Mux Video Uploader plugin. However, there is no such requirement for Self-Hosted WordPress instance.

A. From the WordPress Plugin Directory

1. In your WordPress admin panel, navigate to Plugins > Add Plugin on the sidebar
2. Search and select "Mux Video Uploader by 2Coders"



3. Click Install and activate button on the plugin page.



B: Manual Installation

1. Download the plugin ZIP file from the WordPress.org site.
2. In your WordPress admin panel, go to Plugins > Add Plugin
3. Click Upload Plugin and select the downloaded ZIP file



4. Click Install Now and then Activate Plugin

After the plugin is properly installed, you should see the Mux Video Uploader plugin on the Installed Plugins page.

2. Create a Mux Account
If you don't already have a Mux account:

1. Sign up at mux.com
2. After creating your account, navigate to your dashboard
3. Generate API Access Token. You'll need both an Access Token ID and Secret Key for the plugin to make API requests.



   The access token should have Mux Video Read and Write permissions as well as Mux Data (read-only).



3. Connect WordPress to Mux

In your WordPress admin panel, locate the new Mux Video menu item
1. Go to Mux Video > Settings
2. Enter your Mux API credentials (API ID and Secret Key)
3. Click Save Settings



4. Upload Video

The video below shows how to upload a video on WordPress using the Mux Video Uploader plugin. You can also enable advanced features, like Signed URLs, Subtitles & Captions, and MP4 generation during asset creation or later on from the Assets List page.

5. Play Video

Using the Gutenberg Block

The uploaded video can be added to your WordPress site using the Gutenberg block Editor:

1. Add or Edit a post or page
2. Click the + icon to add a new block
3. Search for "Mux Video" and select the block
4. Choose the asset from the list and click Insert
5. Preview and publish your content

When using the Gutenberg block, the video is embedded onto the page with the default Mux Player configuration.

Using the Shortcode Block

The same uploaded videos can also be added using the Shortcode block. With the Shortcode, you can customize the Mux Player configuration instead of using the default configuration.

Advanced video options

Video Quality Levels

When uploading a new video, you can select which Video Quality Levels is used when preparing the Asset. Possible selections are Basic, Plus and Premium. More details can be found in our Use Video Quality Options guide.

MP4 Generation

Each Asset can be enabled to generate downloadable MP4s. You can select Highest or Audio-Only or both. This will create Static Renditions for the Asset and will make MP4 files available for download to client devices using a formatted URL.

Signed Tokens

When uploading a new video, you can select Protected option when you want to secure the video playback and Public to make the video publicly available. Learn more about Secure video playback.

Mux Video Uploader plugin creates a signing key when configuring the Access Tokens on the plugin's Settings page. The plugin generates Signed URLs when Protected option is selected when uploading the video and available on the Asset page as shown in the image below.

Auto-Generate and Upload Custom Captions/Subtitles

With Mux's auto-generated captions, you can easily add captions to videos uploaded by selecting the language of the spoken words. Mux can generate captions automatically while preparing the asset or later. For generating captions later, go to that Asset entry on the Asset List section of the plugin and click on Add Captions. More details can be found in the Add auto-generated captions to your videos and use transcripts section of our documentation.

The "Auto-generated" captions configuration should only be used to generate a single language captions track. The language selected must match the spoken language.

Additionally, you can upload one or more custom caption files (during asset creation step or later) for a single asset.
