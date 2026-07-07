# Integrate Mux Player into your web application

**Source:** https://mux.com/docs/_guides/developer/player-integrate-in-your-webapp

Install Mux Player

Mux Player has 2 packages:

- @mux/mux-player: the web component, compatible with all frontend frameworks
- @mux/mux-player-react: the React component, for usage in React

Both are built with TypeScript and can be installed either via npm, yarn or the hosted option on jsdelivr. @mux/mux-player can also be used as an ` embed.

NPM


```shell
npm install @mux/mux-player@latest #or @mux/mux-player-react@latest
```


Yarn


```shell
yarn add @mux/mux-player@latest #or @mux/mux-player-react@latest
```


CDN


```html
<script src="https://cdn.jsdelivr.net/npm/@mux/mux-player" defer></script>
<!--
or
<script src="https://cdn.jsdelivr.net/npm/@mux/mux-player-react" defer></script>
-->
```


Embed

```html
<iframe
  src="https://player.mux.com/{PLAYBACK_ID}"
  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
  allowfullscreen="true"
></iframe>
```


Providing attributes

While syntax differs between React and HTML, there are two recommended values to provide in either approach:

- Playback ID: Used by the player to create a URL that describes where the video can be streamed from. Under the hood this looks like stream.mux.com/{PLAYBACK_ID}.m3u8.
- metadata: Information about the video to be tracked by Mux Data as part of a view. At a minimum, you should provide video_id, video_title, and viewer_user_id. See: Mux Data Metadata.

HTML Web Component attributes

In the HTML web component, using JavaScript it can be assigned as a property on the element:


```js
document.querySelector("mux-player").metadata = { video_id: "video-id-123" };
```


Or, you can add them as attributes to the player in the HTML using the metadata-* prefix:


```html
<mux-player
  playback-id="EcHgOK9coz5K4rjSwOkoE7Y7O01201YMIC200RI6lNxnhs"
  metadata-video-id="video-id-123456"
  metadata-video-title="Big Buck Bunny"
  metadata-viewer-user-id="user-id-bc-789"
>
```


HTML embed attributes
In the HTML embed, you can add most supported attributes to the URL as query parameters.

  Remember that query parameters should be URL encoded. You might do this with encodeURIComponent().


```html
<iframe
  src="https://player.mux.com/{PLAYBACK_ID}?metadata-video-id=video-id-123456&metadata-video-title=Bick%20Buck%20Bunny&metadata-viewer-user-id=user-id-bc-789"
  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
  allowfullscreen="true"
></iframe>
```


React attributes

Following JavaScript conventions, attributes in React are camelCased rather than kebab-cased. For example, playback-id becomes playbackId.

metadata is specified as an object in props.


```jsx
<MuxPlayer
  playbackId="EcHgOK9coz5K4rjSwOkoE7Y7O01201YMIC200RI6lNxnhs"
  metadata={{
    video_id: 'video-id-123456',
    video_title: 'Big Buck Bunny',
    viewer_user_id: 'user-id-bc-789',
  }}
></MuxPlayer>
```


Examples

HTML element

When using the HTML element version of Mux Player, you will see the Player Software in Mux Data come through as mux-player.

HTML embed

When using the HTML embed version of Mux Player, you will see the Player Software in Mux Data come through as mux-player-iframe.

React

When using the React version of Mux Player, you will see the Player Software in Mux Data come through as mux-player-react.

Svelte

Since Svelte supports web components, here is an examples of using @mux/mux-player component. View the Sveltkit example in the Mux Elements repo for a fully functioning example.


```html
<script context="module" lang="ts">
  export const prerender = true;
</script>

<script lang="ts">
  // this prevents the custom elements from being redefined when the REPL is updated and reloads, which throws an error
  // this means that any changes to the custom element won't be picked up without saving and refreshing the REPL
  // const oldRegister = customElements.define;
  // customElements.define = function(name, constructor, options) {
  // 	if (!customElements.get(name)) {
  // 		oldRegister(name, constructor, options);
  // 	}
  // }
  // import { page } from '$app/stores';
  import { onMount } from "svelte";
  onMount(async () => {
    await import("@mux/mux-player");
  });
</script>

<mux-player
  playback-id="g65IqSFtWdpGR100c2W8VUHrfIVWTNRen"
  metadata-video-id="video-id-54321"
  metadata-video-title="Svelte Kit: Episode 2"
  metadata-viewer-user-id="user-id-sveltekit007"
/>
```


Vue

Since Vue supports web components, here is an examples of using @mux/mux-player` component. View the Vue example in the Mux Elements repo for a fully functioning example.


```html
<script setup lang="ts">
  import "@mux/mux-player";
</script>

<template>
  <main>
    <mux-player
      playback-id="g65IqSFtWdpGR100c2W8VUHrfIVWTNRen"
      metadata-video-id="video-id-54321"
      metadata-video-title="Vue 3: Episode 2"
      metadata-viewer-user-id="user-id-vue3007"
    />
  </main>
</template>
```


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
  <GuideCard
    title="Advanced usage"
    description="Learn about advanced usage of Mux Player"
    links={[
      {
        title: "Read the guide",
        href: "/docs/guides/player-advanced-usage",
      },
    ]}
  />
