# _guides_todo/video/

**Source:** https://mux.com/docs/_guides_todo/video/

move this file to guides/video/index.mdx
---
title:
product:
description:
steps:
  - title:
    description:
  - title:
    description:
---

Mux Video is the API that makes you a video expert. With just a few simple API calls, add and stream videos that play anywhere and look beautiful, every time, at scale.

For interacting with the Mux API we created open source language-specific SDKs for most popular server-side languages. Find more information about them here:

   ruby
   go
   python
   php
   node
   elixir
[block:api-header]
{
  "title": "1. Get an API Access Token"
}
[/block]
The Mux Video API uses a token key pair that consists of a Token ID and Token Secret for authentication. If you haven't already, generate a new Access Token in the Access Token settings of your Mux account dashboard.
[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/3848f6d-Screen_Shot_2018-01-25_at_5.11.18_PM.png",
        "Screen Shot 2018-01-25 at 5.11.18 PM.png",
        1790,
        644,
        "e7e7e7"
      ]
    }
  ]
}
[/block]
The Access Token should be set to "Full Access" for Mux Video.
[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/f5498b5-Screen_Shot_2018-01-25_at_5.12.17_PM.png",
        "Screen Shot 2018-01-25 at 5.12.17 PM.png",
        1152,
        478,
        "fbfbfb"
      ]
    }
  ]
}
[/block]
Access Tokens also belong to an Environment. Be sure to use the same Environment when using Mux Video and Mux Data together, so the data from Mux Data can be used to optimize your Mux Video streams.
[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/bf0a53d-Screen_Shot_2018-01-31_at_8.17.39_PM.png",
        "Screen Shot 2018-01-31 at 8.17.39 PM.png",
        1140,
        374,
        "fdfdfd"
      ]
    }
  ]
}
[/block]

[block:api-header]
{
  "title": "2. POST a video"
}
[/block]
(Detailed API reference)

Videos stored in Mux are called assets. To create your first video asset, send a POST request to the /assets endpoint and set the "input" property to the URL of a video file that's accessible online.

Note that Mux does not store the original file in its exact form, so if you want to retain your masters, don't delete them after submitting to Mux. Mux will also never need to download your video file again, unless you use it to create more assets.
[block:html]
{
  "html": "\n\n\n  Fill in the form details to auto-populate the example code.\n  \n  \n    Enter a URL to a video file (or use the default)\n    \n  \n  \n    Enter your API Access Token\n    \n  \n  \n    Enter your Secret Key\n    \n  \n\n\n\n\n\n  .MuxDocForm label {\n    display: block;\n    line-height: 2em;\n    font-weight: bold;\n    color: 777;\n    font-size: 13px;\n    padding-bottom: 3px;\n  }\n\n  .MuxDocForm input {\n    box-sizing: border-box;\n    width: 100%;\n    margin-bottom: 20px;\n    padding: 8px 10px;\n  }\n  \n  .MuxDocForm input::placeholder {\n  \tcolor: ccc;\n  }\n  \n  .CopyButton {\n    margin: 10px 5px 5px 0;\n  \tpadding: 10px;\n  }\n"
}
[/block]

[block:code]
{
  "codes": [
    {
      "code": "curl https://api.mux.com/video/v1/assets \\\n  -H \"Content-Type: application/json\" \\\n  -X POST \\\n  -d '{ \"input\": \"{INPUT_URL}\", \"playback_policy\": \"public\" }' \\\n  -u ${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET} | json_pp",
      "language": "curl"
    }
  ]
}
[/block]
The response will include an Asset ID and a Playback ID.

- Asset IDs are used to manage assets using api.mux.com (e.g. to read or delete an asset).
- Playback IDs are used to stream an asset to a video player through stream.mux.com. You can add multiple playback IDs to an asset to create playback URLs with different viewing permissions, and you can delete playback IDs to remove access without deleting the asset.
[block:code]
{
  "codes": [
    {
      "code": "{\n   \"data\" : {\n      \"id\" : \"ymDhKE00YZ12XxJLFo76DIVqCzL15bVf2\",\n      \"created_at\" : \"1517531451\",\n      \"playback_ids\" : [\n         {\n            \"id\" : \"EsxKJmzkfLvGV01cbThYHDcEz7TKcbR31\",\n            \"policy\" : \"public\"\n         }\n      ],\n      \"status\" : \"preparing\"\n   }\n}",
      "language": "json",
      "name": "Example API Response Body (JSON)"
    }
  ]
}
[/block]

[block:api-header]
{
  "title": "3. Wait for \"ready\""
}
[/block]
(Detailed API reference)

As soon as you POST a video, Mux begins downloading and processing the video. For shorter files, this often takes just a few seconds. Very large files over poor connections may take a few minutes (or longer).

When the video is ready for playback, the asset "status" changes to "ready".

The best way to do this is via webhooks. Mux can send a webhook notification as soon as the asset is ready. See the Webhooks documentation for details.

If you can't use webhooks for some reason, you can manually poll the asset API to see asset status. Note that this only works at low volume. Try this example:
[block:html]
{
  "html": "\n  Fill in the form details to auto-populate the example code.\n  \n  \n    Enter the Asset ID from the API response\n    \n  \n\n\n"
}
[/block]

[block:code]
{
  "codes": [
    {
      "code": "curl -X GET https://api.mux.com/video/v1/assets/{ASSET_ID} \\\n  -u ${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET} | json_pp",
      "language": "curl"
    }
  ]
}
[/block]
Please don't poll this API more than once per second.
[block:api-header]
{
  "title": "4. Watch it"
}
[/block]
To play back an asset, just create a playback URL using the PLAYBACK_ID you received when you created the asset.
[block:html]
{
  "html": "\n  Fill in the form details to auto-populate the example code.\n  \n  \n    Enter the Playback ID from the API response (be sure it's the Playback ID and not the Asset ID)\n    \n  \n\n\n"
}
[/block]

[block:code]
{
  "codes": [
    {
      "code": "https://stream.mux.com/{PLAYBACK_ID}.m3u8",
      "language": "http"
    }
  ]
}
[/block]
The easiest way to test asset playback is to try this playback URL in Safari (Mac) or Edge (Windows), which can natively play back HTTP Live Streaming (HLS) video.
[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/8813587-Screen_Shot_2018-01-25_at_4.59.06_PM.png",
        "Screen Shot 2018-01-25 at 4.59.06 PM.png",
        1936,
        936,
        "908b77"
      ]
    }
  ]
}
[/block]

[block:api-header]
{
  "title": "5. Configure playback"
}
[/block]
Playback Guide

Now you're ready to integrate with a video player. Mux Video supports any modern video player capable of playing the HLS streaming format: most web players, iOS, Android, and many connected TV devices.
[block:api-header]
{
  "title": "6. Generate thumbnails"
}
[/block]
Thumbnail Guide

Now see what else you can do with the API, starting with thumbnails. Generate images directly from the video in real time.

[block:api-header]
{
  "title": "7. Configure Mux Data for monitoring"
}
[/block]
Data Implementation Guide

Mux Video is optimized by real-world performance monitoring, via Mux Data. Use Mux Data to monitor your whole video playback stack, including your player and application performance. Installing Mux Data is easy, and usually just involves pasting in a bit of Javascript (or Objective-C, or Java) alongside your video player.
