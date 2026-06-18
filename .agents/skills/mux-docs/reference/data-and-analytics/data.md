# _guides_todo/data/

**Source:** https://mux.com/docs/_guides_todo/data/

move this file to guides/data/index.mdx
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

Mux Data is the best way to monitor video streaming performance.

Integration is easy - just initialize the Mux SDK, pass in some metadata, and you're up and running in minutes.
[block:api-header]
{
  "title": "1. Choose an Environment"
}
[/block]
An Environment represents the highest grouping of data you want to combine and compare within. Multiple websites/apps or video platforms can use the same environment, but we suggest not combining staging and production data.

There are four types of environments: Development, QA, Staging, and Production. Use Production for your integration with your Production video players, Staging or QA if you have a staging or QA environment, and Development for your local testing.

Two environments are created automatically at time of sign-up: Development and Production. Choose the one you want to use or create a new environment by clicking "Add Environment" on the Environments page.
[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/6313a49-Screen_Shot_2018-01-31_at_7.57.59_PM.png",
        "Screen Shot 2018-01-31 at 7.57.59 PM.png",
        1290,
        682,
        "f4fbfa"
      ]
    }
  ]
}
[/block]
If you integrate with Mux Video, be sure that you use the same Environment on both sides, so that the data from Mux Data correctly optimizes your Mux Video streaming.
[block:api-header]
{
  "title": "2. Integrate with your player"
}
[/block]
After you create an environment, you'll see an Env Key and a link to "Track video performance". Use this link to choose a player integration, or just jump to your player:

 - Web Integration Guide
 - iOS Integration Guide
 - Android Integration Guide
 - Integration Guide: Chromecast
 - Integration Guide: Roku
 - Integration Guide: Samsung TVs
 - Integration Guide: LG Smart TVs
[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/23d709e-Screen_Shot_2020-06-26_at_11.06.25_AM.png",
        "Screen Shot 2020-06-26 at 11.06.25 AM.png",
        2004,
        250,
        "f8f9f9"
      ]
    }
  ]
}
[/block]

[block:api-header]
{
  "title": "3. Add metadata"
}
[/block]
By default, Mux Data will automatically capture as much metadata about the video view as possible from the player and the environment. In addition, Mux Data is more useful as you add more metadata about the views so we encourage you to add more metadata to your views in order to make it easier to identify areas for improvement in your video platform.

You can add information about the view such as video title, type of viewer connection (wired, wifi, etc.), content delivery network (CDN) used, and more. Most metadata you would like to capture for your reporting can be added to the Mux Data metadata about a view.

If you are implementing a custom SDK integration, you should collect as much of the same metadata as possible.

The most useful metadata is Video Title and Video ID but many other types of metadata can be specified. Please refer to the Metadata integration guide for a complete list of dimensions and filters supported by Mux Data.
[block:api-header]
{
  "title": "4. Start seeing data"
}
[/block]
After you've integrated, use the Mux Data dashboard to dive deep into your video streaming performance. Data should start showing up a few minutes after you integrate.
[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/fab0c35-Screen_Shot_2018-01-31_at_8.06.55_PM.png",
        "Screen Shot 2018-01-31 at 8.06.55 PM.png",
        2376,
        1400,
        "edeaeb"
      ]
    }
  ]
}
[/block]

[block:api-header]
{
  "title": "5. (Optional) Integrate with the Mux Data API"
}
[/block]
The Mux Data dashboard is entirely powered by APIs, and these APIs are available to customers on certain plans. Visit the Mux Data API Docs for details.
