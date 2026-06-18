# Use Video.js with Mux

**Source:** https://mux.com/docs/_guides/developer/playback-videojs-with-mux

Video.js kit is a project built on Video.js with additional Mux specific functionality built in.
This includes support for:

- Enabling timeline hover previews
- Mux Data integration
- playback_id helper (we'll figure out the full playback URL for you)

Video.js kit is hosted on npm. To install it, navigate to your project and run:


```text
// npm
npm install @mux/videojs-kit

// yarn
yarn add @mux/videojs-kit
```


Now import the JavaScript and CSS in your application like this:


```js
// include the video.js kit JavaScript and CSS
import videojs from '@mux/videojs-kit';
import '@mux/videojs-kit/dist/index.css';
```


If you're not using a package manager such as npm, there are hosted versions provided by jsdelivr.com available too.
Use the hosted versions by including this in your HTML page:


```html
// script
<script src="https://cdn.jsdelivr.net/npm/@mux/videojs-kit@latest/dist/index.js"></script>
// CSS
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@mux/videojs-kit@latest/dist/index.css">
```


Then, on your page include a ` element where you want to add your player.


```html
<video
  id="my-player"
  class="video-js vjs-16-9"
  controls
  preload="auto"
  width="100%"
  data-setup='{}'
>
  <source src="{PLAYBACK_ID}" type="video/mux" />
</video>
```


Replace the \{PLAYBACK_ID\} with the playback_id of your video from Mux.

Integrate using Video.js's default playback engine.

Video.js kit by default uses hls.js.
As of version 0.8.0, you can now integrate with Video.js's default playback engine.

To do so, you can follow the steps above but swap out the specific import file to be index.vhs.js.

For import:

```js
// include the video.js kit JavaScript and CSS
import videojs from '@mux/videojs-kit/dist/index.vhs.js';
```


For a script tag:

```html
<script src="https://unpkg.com/@mux/videojs-kit@latest/dist/index.vhs.js"></script>
```


Source Code

Video.js kit is open source and can be found on GitHub here: https://github.com/muxinc/videojs-mux-kit

There are some built in additional features which can be set when you initialize video.js kit.

Include a timeline hover preview
You can enable a timeline hover preview by including timelineHoverPreviews: true in the configuration options when you create your player.


```html
<video id="my-player" class="video-js vjs-16-9" controls preload="auto" width="100%"
  data-setup='{
    "timelineHoverPreviews": true
  }'
>
  <source src="{PLAYBACK_ID}" type="video/mux" />
</video>
```


Enable Mux Data
You can enable Mux Data by including the following options when you create your player.


```html
<video id="my-player" class="video-js vjs-16-9" controls preload="auto" width="100%"
  data-setup='{
    "plugins": {
      "mux": {
        "debug": true,
        "data":{
          "env_key": "ENV_KEY",
          "video_title": "Example Title"
        }
      }
    }
  }'
>
  <source src="{PLAYBACK_ID}" type="video/mux" />
</video>
```


The videojs-mux data plugin is included by default, so you don't need to include this in addition to video.js kit. To link your data integration to your account,
you should replace the ENV_KEY in the configuration with an appropriate Mux environment key, as well as set metadata.

Set the video source

You can set the video source using the playback_id from your video in Mux, and we'll figure out the fully formed playback URL automatically.

When you set the source for video.js, make sure you set the type as video/mux and the src as your playback_id.


```html
<video id="my-player" class="video-js vjs-16-9" controls preload="auto" width="100%">
  <source src="{PLAYBACK_ID}" type="video/mux" />
</video>

```


Initialize with JavaScript

The options above can also be initialized with JavaScript. Here's an example showing how you could enable all options with JavaScript.


```html
<video id="my-player" class="video-js vjs-16-9" controls preload="auto" width="100%">
</video>

<script>
const player = videojs('my-player', {
  timelineHoverPreviews: true,
  plugins: {
    mux: {
      debug: false,
      data: {
        env_key: 'ENV_KEY',
        video_title: 'Example Title'
      }
    }
  }
});

player.src({
  src: "{PLAYBACK_ID}",
  type: "video/mux",
});
</script>
```


Playback of Mux videos with a signed playback policy is now supported from v0.3.0 onward.

Before continuing, ensure you have followed the secure video playback guide, and are comfortable generating JSON Web Tokens (JWTs) to use with Mux.

Playback a video with a signed URL

Use the playback_id from your video in Mux and then append your video JWT token
like this {PLAYBACK_ID}?token={YOUR_VIDEO_JWT} as your player source. When you set the source for video.js, make sure you set the type as video/mux.

In HTML:

```html
<video id="my-player" class="video-js vjs-16-9" controls preload="auto" width="100%" data-setup="{}">
  <source src="{PLAYBACK_ID}?token={JWT_VIDEO_TOKEN}" type="video/mux" />
</video>

```


Or, achieve the same result using JavaScript:

```html
<video id="my-player" class="video-js vjs-16-9" controls preload="auto" width="100%">
</video>

<script>
const player = videojs('my-player', {
  plugins: {
    mux: {
      debug: false,
      data: {
        env_key: 'ENV_KEY',
        video_title: 'Example Title'
      }
    }
  }
});

player.src({
  src: `{PLAYBACK_ID}?token={JWT_VIDEO_TOKEN}`,
  type: `video/mux`,
});

</script>
```


Enable a timeline hover preview from a signed URL

Mux requires a separate JWT token to access the timeline hover preview storyboard URL, which isn't something that Video.js Kit is able to automatically figure out,
unlike with public playback URLs. Instead, we require the fully formed URL to be passed to the player.

To setup timeline hover previews with a signed URL, first make sure that timelineHoverPreviews is set to false or not set at all, which stops the automatic URL generation taking place.
Then, either set the timelineHoverPreviewsUrl in the player configuration like this:


```html
<video id="my-player"
  class="video-js vjs-16-9"
  controls
  preload="auto"
  width="100%"
  data-setup='{
    "timelineHoverPreviewsUrl": "https://image.mux.com/{PLAYBACK_ID}/storyboard.vtt?token={JWT_STORYBOARD_TOKEN}"
  }'>
  <source src="{PLAYBACK_ID}?token={JWT_VIDEO_TOKEN}" type="video/mux" />
</video>

```


Or, achieve the same result using JavaScript and use the player.timelineHoverPreviews() function:

```html
<video id="my-player" class="video-js vjs-16-9" controls preload="auto" width="100%">
</video>

<script>
const player = videojs('my-player', {
  plugins: {
    mux: {
      debug: false,
      data: {
        env_key: 'ENV_KEY',
        video_title: 'Example Title'
      }
    }
  }
});

player.src({
  src: `{PLAYBACK_ID}?token={JWT_VIDEO_TOKEN}`,
  type: `video/mux`,
});

player.timelineHoverPreviews({
  enabled: true,
  src: "https://image.mux.com/{PLAYBACK_ID}/storyboard.vtt?token={JWT_STORYBOARD_TOKEN}"
});

</script>
```


player.timelineHoverPreviews is a function that can be used to set, update or remove timeline hover previews from a player, and takes a single object parameter.

The object has two properties, src which should be a string pointing to the VTT file which contains the timeline hover previews information, and enabled which can be
either true for the player to attempt to use the provided source and setup the timeline hover previews, or false which will disable any timeline hover previews which are
currently configured on the player.

Remove timeline hover previews

To switch off timeline hover previews, you can use the following API;


```js

player.timelineHoverPreviews({
  enabled: false,
});
```


As of version v0.10.0, Video.js kit comes bundled with the [videojs-contrib-quality-levels][] and [videojs-http-source-selector][] plugins. They are not enabled by default.

To enable them, you can pass it in as part of the plugins object:

```html
<video id="my-player" class="video-js vjs-16-9" controls preload="auto" width="100%"
  data-setup='{
    "plugins": {
      "mux": {
        "debug": true,
        "data":{
          "env_key": "ENV_KEY",
          "video_title": "Example Title"
        }
      },
      "httpSourceSelector": {}
    }
  }'
>
  <source src="{PLAYBACK_ID}" type="video/mux" />
</video>
```


Or, you call the httpSourceSelector function manually on the player:

```html
<video id="my-player" class="video-js vjs-16-9" controls preload="auto" width="100%">
</video>

<script>
const player = videojs('my-player', {
  timelineHoverPreviews: true,
  plugins: {
    mux: {
      debug: false,
      data: {
        env_key: 'ENV_KEY',
        video_title: 'Example Title'
      }
    }
  }
});

player.src({
  src: "{PLAYBACK_ID}",
  type: "video/mux",
});

// enable the quality selector plugin
player.httpSourceSelector();
</script>
```


If you want to use another plugin but when you load up your page, but the plugin isn't loading up in Video.js, you'll need to configure Webpack, or another bundler specially.
This is due to the internals of how Video.js and Video.js kit are built. When using the default build, Video.js kit doesn't use the default Video.js built, but rather Video.js's core.js build. This means that Video.js plugins need to be configured use the same build.
This can be done with Webpack's resolve.alias configuration:

```js
config.resolve = {
  alias: {
    'video.js': 'video.js/core',
  }
};
```


Current release: v0.11.0
View v0.11.0

This release enables configuring hls.js via Video.js options:


```js
videojs('mux-default', {
  html5: {
    hls: {
      capLevelToPlayerSize: true
    }
  }
});
```


For advanced use cases, the hlsjs instance is exposed on the tech.

Previous releases

v0.10.0
View v0.10.0

- This release includes [videojs-contrib-quality-levels][] and [videojs-http-source-selector][] by default.

v0.9.3
View v0.9.3

- Update Video.js version to v7.18.1.

v0.9.2
View v0.9.2

- Update hls.js to v1.1.5

v0.9.1
View v0.9.1

- As part of 0.7.0, tighter error handling integration with hls.js made all errors be triggered on the player. This meant that errors that don't inhibit playback and that hls.js handled automatically were treated the same as fatal errors that hls.js doesn't handle automatically. Now, only errors that hls.js considers fatal will trigger an error event.

v0.9.0
View v0.9.0

- Integrate with videojs-contrib-quality-levels`.

v0.8.0
View v0.8.0

- Introduce VHS build file

Check the GitHub releases page for the full version history.

[videojs-http-source-selector]: https://github.com/jfujita/videojs-http-source-selector
[videojs-contrib-quality-levels]: https://github.com/videojs/videojs-contrib-quality-levels
