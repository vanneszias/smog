# Monitor Brightcove (Web)

**Source:** https://mux.com/docs/_guides/developer/monitor-brightcove-web

Either include the Mux JavaScript SDK for video.js (videojs-mux) either via the Brightcove Studio by adding the script https://src.litix.io/videojs/4/videojs-mux.js as a new JavaScript line in your Plugins configuration or load videojs-mux from the CDN on your web pages.

<CodeExamples
  examples={{
    npm: npm install --save videojs-mux,
    yarn: yarn add videojs-mux,
    cdn: `
  }}
  exampleOrder="npm,yarn,cdn"
/>

Initialize the videojs player like you normally would and get a reference to the player. Call player.mux with the Mux plugin options to initialize monitoring.


```html
<video
  id="my-player"
  data-video-id="..."
  data-account="..."
  data-player="..."
  data-embed="default"
  data-application-id
  class="video-js"
  controls>
>
</video>

<script>
  const playerInitTime = Date.now();
  // Get a reference to your player, and pass it to the init function
  const player = videojs("my-player");
  player.mux({
    debug: false,
    data: {
      env_key: 'ENV_KEY', // required
      // Metadata
      player_name: '', // ex: 'My Main Player'
      player_init_time: playerInitTime // ex: 1451606400000
      // ... and other metadata
    }
  });
</script>
```


The only required field in the options that you pass into the data options in the player.mux function is env_key. But without some metadata the metrics in your dashboard will lack the necessary information to take meaningful actions. Metadata allows you to search and filter on important fields in order to diagnose issues and optimize the playback experience for your end users.

Pass in metadata under the data on initialization.


```js
// player is the instance returned by the `videojs` function
player.mux({
  debug: false,
  data: {
    env_key: 'ENV_KEY', // required
    // Site Metadata
    viewer_user_id: '', // ex: '12345'
    experiment_name: '', // ex: 'player_test_A'
    sub_property_id: '', // ex: 'cus-1'
    // Player Metadata
    player_name: '', // ex: 'My Main Player'
    player_version: '', // ex: '1.0.0'
    player_init_time: '', // ex: 1451606400000
    // Video Metadata
    video_id: '', // ex: 'abcd123'
    video_title: '', // ex: 'My Great Video'
    video_series: '', // ex: 'Weekly Great Videos'
    video_duration: '', // in milliseconds, ex: 120000
    video_stream_type: '', // 'live' or 'on-demand'
    video_cdn: '' // ex: 'Fastly', 'Akamai'
  }
});
```


For more information, view Make your data actionable.


```js
// player is the instance returned by the `videojs` function
player.mux.emit('videochange', {
  video_id: 'abc345',
  video_title: 'My Other Great Video',
  video_series: 'Weekly Great Videos',
  // ...
});
```


New program


```js
// player is the instance returned by the `videojs` function
player.mux.emit('programchange', {
  video_id: 'abc345',
  video_title: 'My Other Great Video',
  video_series: 'Weekly Great Videos',
  // ...
});
```


Disable cookies


```js
// player is the instance returned by the `videojs` function
player.mux({
  debug: false,
  disableCookies: true,
  data: {
    env_key: "ENV_KEY",
    // ...
  }
});
```


Over-ride 'do not track' behavior


```js
// player is the instance returned by the `videojs` function
player.mux({
  debug: false,
  disableCookies: true,
  data: {
    env_key: "ENV_KEY",
    // ...
  }
});
```


Customize error tracking behavior

Errors tracked by mux are considered fatal meaning that they are the result of playback failures. If errors are non-fatal they should not be captured.

By default, videojs-mux` will track errors emitted from the video element as fatal errors. If a fatal error happens outside of the context of the player, you can emit a custom error to the mux monitor.


```js
// player is the instance returned by the `videojs` function
player.mux.emit('error', {
  player_error_code: 100,
  player_error_message: 'Description of error',
  player_error_context: 'Additional context for the error'
});
```


Error translator


```js
function errorTranslator (error) {
  return {
    player_error_code: translateCode(error.player_error_code),
    player_error_message: translateMessage(error.player_error_message),
    player_error_context: translateContext(error.player_error_context)
  };
}

// player is the return value from the `videojs` function
player.mux({
  debug: false,
  errorTranslator,
  data: {
    env_key: "ENV_KEY",
    // ...
  }
});
```


Disable automatic error tracking


```js
// player is the return value from the `videojs` function
player.mux({
  debug: false,
  automaticErrorTracking: false,
  data: {
    env_key: "ENV_KEY",
    // ...
  }
});
```


Customize beacon collection domain


```js
// player is the return value from the `videojs` function
player.mux({
  debug: false,
  beaconCollectionDomain: 'CUSTOM_DOMAIN', // ex: 'foo.bar.com'
  data: {
    env_key: "ENV_KEY",
    // ...
  }
});
```
