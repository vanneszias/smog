# Enable automatic CDN detection

**Source:** https://mux.com/docs/_guides/developer/enable-automatic-cdn-detection

Mux has the capability to track each network request made by the player in order to expose network-level metrics such as throughput and latency measurements. In addition, Mux is able to auto-detect the CDN used to serve each manifest, segment, or fragment by inspecting certain response headers.  Enabling CDN auto-detection requires some minor configuration at each of your CDNs.

Player SDK Integration

Mux currently supports automatic CDN detection for the following player integrations.

Web

 - HLS.js
 - Dash.js
 - Video.js
 - Shaka player

Android
 - ExoPlayer
 - [AndroidX Media3] (/docs/guides/monitor-androidx-media3)

Simply integrate the player SDK and each network request will be tracked.

For platforms or SDKs that do not support automatic CDN detection using response headers (e.g. iOS, Roku), you can configure your SDK to pass in a CDN value to the corresponding
SDK key if the player is aware of which CDN is delivering content. Learn more in our [metadata guide](/docs//guides/make-your-data-actionable-with-metadata or in the relevant SDK documentation.

CDN Configuration for automatic CDN detection

In order for Mux to automatically detect which CDN is serving the content to the player, you need to make a few configuration changes to each of your CDNs. These changes are necessary to expose two specific headers.

| Header | Description |
| --- | --- |
| X-CDN | This is a custom header that you need to add to all responses from each of your CDNs. The value of this should be a name describing that specific CDN; you should lowercase the name and replace spaces with _s. For example: fastly, cloudfront, level3, etc. |
| Access-Control-Expose-Headers | This should be set on each response, with the value being a comma-separated string of headers to expose to the client. At the least, you should set this to X-CDN. It is also suggested that you add other identifying headers that your CDN may use, such as X-Cache, X-Served-By, Via, or similar headers. More information on Access-Control-Expose-Headers, see here: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Expose-Headers. |

Mid-stream CDN switching and automatic CDN detection

Mid-stream CDN switching changes which CDN is used for content requests. If Mux is automatically detecting the CDN used for video delivery via network events, all detected CDN
values used to deliver video content will be placed in the CDN Trace dimension. The CDN values will be placed in sequential order that they were detected over the course of
view. A cdn_change event will also be created when the SDK detects that the detected CDN has been updated in the network event.
