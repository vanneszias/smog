# Monitor NexPlayer

**Source:** https://mux.com/docs/_guides/developer/monitor-nexplayer

Third-party integration
  This integration is managed and operated by NexPlayer.
  Feedback should be made on the GitHub repo's Issues page or by contacting NexPlayer support by email.

Add the NexPlayer_HTML5_Mux plugin to your project by cloning the GitHub repo or installing using yarn/npm.

Add NexPlayer as you normally would to your solution including recommended CSS styling. In addition, you will need to import the Mux SDK and NexMuxHandShake.js into the ` and set the window.muxPlayerInitTime to the current date/time.

  NexPlayer minimum version
  Be sure to use the NexPlayer SDK v5.5.3.1 as it contains necessary functionality to integrate with Mux.


```html
<head>
  <style type="text/css">
    #player_container {
      position: relative;
      padding-top: 28%;
      padding-bottom: 28%;
      left: 28%;
    }

    #player {
      background-color: #191828;
      position: absolute;
      top: 0%;
      width: 50%;
      height: 50%;
    }
  </style>
  <script type="text/javascript" src="https://src.litix.io/core/4/mux.js"></script>
  <script type="text/javascript" src="https://nexplayer.nexplayersdk.com/5.5.3.1/nexplayer.js"></script>
  <script type="text/javascript" src="../node_modules/NexPlayer_HTML5_Mux/app/NexMuxHandShake.js"></script>
  <script type="text/javascript">window.muxPlayerInitTime = Date.now();</script>
</head>
```


Initialize your instance of NexPlayer with a configuration that includes the NexPlayer_HTML5_Mux plugin that activates Mux Data. Be sure to replace the ENV_KEY and NEXPLAYER_KEY with respective values.

The only required field in the options that you pass into the NexPlayer_HTML5_Mux plugin is ENV_KEY. But without some metadata the metrics in your dashboard will lack the necessary information to take meaningful actions. Metadata allows you to search and filter on important fields in order to diagnose issues and optimize the playback experience for your end users.

Pass in metadata under the muxConfiguration` on initialization.


```js
var muxConfiguration = {
  debug: false,
  data: {
    env_key: 'ENV_KEY', // required
    // Site Metadata
    viewer_user_id: '', // ex: '12345'
    experiment_name: '', // ex: 'player_test_A'
    sub_property_id: '', // ex: 'cus-1'
    // Player Metadata
    player_name: 'NexPlayer', // ex: 'My Main Player'
    player_version:  '', // ex: '1.0.0'
    player_init_time: window.muxPlayerInitTime, // ex: 1451606400000
    // Video Metadata
    video_id: '', // ex: 'abcd123'
    video_title: '', // ex: 'My Great Video'
    video_series: '', // ex: 'Weekly Great Videos'
    video_duration: '', // in milliseconds, ex: 120000
    video_stream_type: '', // 'live' or 'on-demand'
    video_cdn: '' // ex: 'Fastly', 'Akamai'
  },
};
```


For more information, view Make your data actionable.

New source


```js
// nexMux is the instance returned by the
// `new NexMuxHandShake()` in the above example
nexMux.videoChange({
  video_id: 'abc345',
  video_title: 'My Other Great Video',
  video_series: 'Weekly Great Videos',
  // ...
});
```


New program


```js
// nexMux is the instance returned by the
// `new NexMuxHandShake()` in the above example
nexMux.programChange({
  video_id: 'abc345',
  video_title: 'My Other Great Video',
  video_series: 'Weekly Great Videos',
  // ...
});
```


Disable cookies


```js
var muxConfiguration = {
  debug: false,
  disableCookies: true,
  data: {
    env_key: 'ENV_KEY', // required
    ...
  },
};
```


Over-ride 'do not track' behavior


```js
var muxConfiguration = {
  debug: false,
  respectDoNotTrack: true,
  data: {
    env_key: 'ENV_KEY', // required
    ...
  },
};
```


Disable automatic error tracking


```js
var muxConfiguration = {
  debug: false,
  automaticErrorTracking: false,
  data: {
    env_key: 'ENV_KEY', // required
    ...
  },
};
```


Customize beacon collection domain


```js
var muxConfiguration = {
  debug: false,
  beaconCollectionDomain: 'CUSTOM_DOMAIN', // ex: 'foo.bar.com'
  data: {
    env_key: 'ENV_KEY', // required
    ...
  },
};
```
