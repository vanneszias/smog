# Mux Player for web

**Source:** https://mux.com/docs/_guides/developer/mux-player-web

Mux Player is a drop-in component that you can put in your web application to play Mux assets. Mux Player supports:

- on-demand assets
- live streams
- low-latency live streams
- DVR mode for live or low-latency live streams

Mux Player can be used as a web component (` from @mux/mux-player), as a React component ( from @mux/mux-player-react), or as a web embed ()

Mux Player is fully-featured video player for content hosted by Mux Video. Mux Player is fully integrated with Mux Data without any extra configuration. Mux Player provides a responsive UI based on video player dimensions and stream type, automatic thumbnail previews and poster images, and modern video player capabilities (fullscreen, picture-in-picture, Chromecast, AirPlay).

Here are some examples of Mux Player in action.

HTML element

Install with either npm, yarn or load Mux Player from the hosted script.

NPM


```shell
npm install @mux/mux-player@latest
```


Yarn


```shell
yarn add @mux/mux-player@latest
```


Hosted


```html
<script src="https://cdn.jsdelivr.net/npm/@mux/mux-player" defer></script>
```


Example HTML element implementation


```html
<script src="https://cdn.jsdelivr.net/npm/@mux/mux-player" defer></script>
<mux-player
  playback-id="EcHgOK9coz5K4rjSwOkoE7Y7O01201YMIC200RI6lNxnhs"
  metadata-video-title="Test VOD"
  metadata-viewer-user-id="user-id-007"
></mux-player>
```


When using the HTML element version of Mux Player, you will see the Player Software in Mux Data come through as mux-player.

HTML Embed
Example HTML embed implementation


```html
<iframe
  src="https://player.mux.com/EcHgOK9coz5K4rjSwOkoE7Y7O01201YMIC200RI6lNxnhs?metadata-video-title=Test%20VOD&metadata-viewer-user-id=user-id-007"
  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
  allowfullscreen="true"
></iframe>
```


When using the HTML embed version of Mux Player, you will see the Player Software in Mux Data come through as mux-player-iframe.

React

You will need to select one of the package options below. Both examples will automatically update the player. You can always anchor the package to a specific version if needed.

NPM


```shell
npm install @mux/mux-player-react@latest
```


Yarn


```shell
yarn add @mux/mux-player-react@latest
```


Example React implementation

When using the React version of Mux Player, you will see the Player Software in Mux Data come through as mux-player-react.

As shown in the examples above, the available controls will adjust based on your video's stream type, live or on-demand.

Mux Player will also take into account the size that the player is being displayed at, regardless of the browser window size, and will selectively hide controls that won't fit in the UI.

In the latest version of Mux Player stream type is automatically set and you don't need to manually provide this. Player themes other than the default theme that need to know what the stream type is may need it defined to avoid the player having a delay in showing the correct controls. In this instance, you would set stream-type (streamType in React) to either on-demand or live so that the UI can adapt before any information about the video is loaded.

The following will also appear in some use cases based on support detection:

- AirPlay
- Chromecast. Requires an extra step, see the customize look and feel guide.
- Fullscreen
- Picture-in-picture button
- Volume controls

  <GuideCard
    title="Core functionality"
    description="Understand the features and core functionality of Mux Player"
    links={[
      {
        title: "Read the guide",
        href: "/docs/guides/player-core-functionality",
      },
    ]}
  />
  <GuideCard
    title="Integrate Mux Player"
    description="Interate Mux Player in your web application. See examples in popular front end frameworks."
    links={[
      {
        title: "Read the guide",
        href: "/docs/guides/player-integrate-in-your-webapp",
      },
    ]}
  />
  <GuideCard
    title="Customize the look and feel"
    description="Customize Mux Player to match your brand"
    links={[
      {
        title: "Read the guide",
        href: "/docs/guides/player-customize-look-and-feel",
      },
    ]}
  />

The default accent color of the player is Mux pink fa50b5. You should override this with your brand color. Use the accent-color HTML attribute or accentColor` React prop.


```html
<mux-player
  playback-id="EcHgOK9coz5K4rjSwOkoE7Y7O01201YMIC200RI6lNxnhs"
  accent-color="#ea580c"
  metadata-video-title="Test VOD"
  metadata-viewer-user-id="user-id-007"
></mux-player>
```


For React:


```jsx
<MuxPlayer
  playbackId="EcHgOK9coz5K4rjSwOkoE7Y7O01201YMIC200RI6lNxnhs"
  accentColor="#ea580c"
  metadata={{
    videoTitle: "Test VOD",
    ViewerUserId: "user-id-007"
  }}
/>
```
