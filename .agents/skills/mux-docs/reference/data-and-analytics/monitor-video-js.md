# Monitor video.js

**Source:** https://mux.com/docs/_guides/developer/monitor-video-js

Include the Mux JavaScript SDK on every page of your web app that includes video. You can use the Mux-hosted version of the script or install via npm. videojs-mux follows semantic versioning and the API will not change between major releases.

Call video.js like you normally would and include the Mux plugin options.

The only required field in the options that you pass into videojs-mux is env_key. But without some metadata the metrics in your dashboard will lack the necessary information to take meaningful actions. Metadata allows you to search and filter on important fields in order to diagnose issues and optimize the playback experience for your end users.

Pass in metadata under the data on initialization.


```js
videojs('#my-player', {
  plugins: {
    mux: {
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
        // There is no need to provide player_init_time, tracked automatically
        // player_init_time: '', // ex: 1451606400000;
        // Video Metadata
        video_id: '', // ex: 'abcd123'
        video_title: '', // ex: 'My Great Video'
        video_series: '', // ex: 'Weekly Great Videos'
        video_duration: '', // in milliseconds, ex: 120000
        video_stream_type: '', // 'live' or 'on-demand'
        video_cdn: '' // ex: 'Fastly', 'Akamai'
      }
    }
  }
});
```


For more information, view Make your data actionable.

There are some cases where you may not have the full set of metadata until after the video playback has started. In this case, you should omit the values when you first initialize the Mux SDK. Then, once you have the metadata, you can update the metadata with the updateData method.


```js
// player is the instance returned by the `videojs` function
player.mux.updateData({ video_title: 'My Updated Great Video' });
```


New source


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
videojs('#my-player', {
  plugins: {
    mux: {
      debug: false,
      disableCookies: true,
      data: {
        env_key: "ENV_KEY",
        // ...
      }
    }
  }
});
```


Over-ride 'do not track' behavior


```js
videojs('#my-player', {
  plugins: {
    mux: {
      debug: false,
      respectDoNotTrack: true,
      data: {
        env_key: "ENV_KEY",
        // ...
      }
    }
  }
});
```


Customize error tracking behavior

Errors tracked by mux are considered fatal meaning that they are the result of playback failures. If errors are non-fatal they should not be captured.

By default, videojs-mux will track errors emitted from the video element as fatal errors. If a fatal error happens outside of the context of the player, you can emit a custom error to the mux monitor.


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

videojs('#my-player', {
  plugins: {
    mux: {
      debug: false,
      errorTranslator,
      data: {
        env_key: "ENV_KEY",
        // ...
      }
    }
  }
});
```


Disable automatic error tracking


```js
videojs('#my-player', {
  plugins: {
    mux: {
      debug: false,
      automaticErrorTracking: false,
      data: {
        env_key: "ENV_KEY",
        // ...
      }
    }
  }
});
```


Ads tracking with videojs-mux

If you are using videojs-ima, Brightcove's IMA3 FreeWheel or OnceUX plugins with VideoJS then videojs-mux will track ads automatically. No extra configuration is needed.

Customize beacon collection domain


```js
videojs('#my-player', {
  plugins: {
    mux: {
      debug: false,
      beaconCollectionDomain: 'CUSTOM_DOMAIN', // ex: 'foo.bar.com'
      data: {
        env_key: "ENV_KEY",
        // ...
      }
    }
  }
});
```
