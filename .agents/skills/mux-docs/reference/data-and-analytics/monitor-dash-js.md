# Monitor dash.js

**Source:** https://mux.com/docs/_guides/developer/monitor-dash-js

Include the Mux JavaScript SDK on every page of your web app that includes video. You can use the Mux-hosted version of the script or install via npm. mux-embed follows semantic versioning and the API will not change between major releases.

Call mux.monitor and pass in a valid CSS selector or the video element itself. Followed by the SDK options and metadata. If you use a CSS selector that matches multiple elements, the first matching element in the document will be used.

In the SDK options, be sure to pass in the dashjs player instance.

Alternatively, if your player does not immediately have access to the dash.js player instance, you can start monitoring dash.js at any time in the future. In order to do this, you can call either of the following:


```js
mux.addDashJS("#my-player", options)
// or
myVideoEl.mux.addDashJS(options)
```


Log in to the Mux dashboard and find the environment that corresponds to your env_key and look for video views. It takes about a minute or two from tracking a view for it to show up on the Metrics tab.

If you aren't seeing data, check to see if you have an ad blocker, tracking blocker or some kind of network firewall that prevents your player from sending requests to Mux Data servers.

The only required field in the options that you pass into mux-embed is env_key. But without some metadata the metrics in your dashboard will lack the necessary information to take meaningful actions. Metadata allows you to search and filter on important fields in order to diagnose issues and optimize the playback experience for your end users.

Pass in metadata under the data key when calling mux.monitor.


```js
mux.monitor('#my-player', {
  debug: false,
  dashjs: dashjsPlayer,
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

There are some cases where you may not have the full set of metadata until after the video playback has started. In this case, you should omit the values when you first call monitor. Then, once you have the metadata, you can update the metadata with the updateData method.


```js
mux.updateData({ video_title: 'My Updated Great Video' });
```


New source


```js
mux.emit('#my-player', 'videochange', {
  video_id: 'abc345',
  video_title: 'My Other Great Video',
  video_series: 'Weekly Great Videos',
  // ...
});
```


New program


```js
mux.emit('#my-player', 'programchange', {
  video_id: 'abc345',
  video_title: 'My Other Great Video',
  video_series: 'Weekly Great Videos',
  // ...
});
```


Disable cookies


```js
mux.monitor('#my-player', {
  debug: false,
  disableCookies: true,
  dashjs: dashjsPlayer,
  data: {
    env_key: 'ENV_KEY',
    // ... rest of metadata
  }
}
```


Over-ride 'do not track' behavior


```js
mux.monitor('#my-player', {
  debug: false,
  dashjs: dashjsPlayer,
  respectDoNotTrack: true, // Disable tracking of browsers where Do Not Track is enabled
  data: {
    env_key: 'EXAMPLE_ENV_KEY',
    // ... rest of metadata
  }
}
```


Customize error tracking behavior

Errors tracked by mux are considered fatal meaning that they are the result of playback failures. If errors are non-fatal they should not be captured.

By default, mux-embed will track errors emitted from the video element as fatal errors. If a fatal error happens outside of the context of the player, you can emit a custom error to the mux monitor.


```js
mux.emit('#my-player', 'error', {
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

mux.monitor('#my-player', {
  debug: false,
  errorTranslator: errorTranslator,
  dashjs: dashjsPlayer,
  data: {
    env_key: 'ENV_KEY', // required

    // ... additional metadata
  }
});
```


Disable automatic error tracking


```js
mux.monitor('#my-player', {
  debug: false,
  automaticErrorTracking: false,
  dashjs: dashjsPlayer,
  data: {
    env_key: 'EXAMPLE_ENV_KEY', // required

    // ... additional metadata
  }
```


Use TypeScript with mux-embed

mux-embed now provides TypeScript type definitions with the published package! If you want to opt in, you can check out how here.

Customize beacon collection domain


```js
mux.monitor('#my-player', {
  debug: false,
  beaconCollectionDomain: 'CUSTOM_DOMAIN', // ex: 'foo.bar.com'
  dashjs: dashjsPlayer,
  data: {
    env_key: 'EXAMPLE_ENV_KEY', // required
    // ... additional metadata
  }
});
```
