# Lazy-loading Mux Player

**Source:** https://mux.com/docs/_guides/developer/player-lazy-loading

Installation

React
After installing @mux/mux-player-react, import Mux Player React Lazy from @mux/mux-player-react/lazy:

Depending on your bundler your import might look a little different. If you're having trouble with the import try:

- @mux/mux-player-react/lazy
- @mux/mux-player-react/dist/lazy.mjs
- @mux/mux-player-react/dist/lazy

  Mux Player React Lazy will not be available if you are using the hosted option
  on jsdelivr.com.

Preventing cumulative layout shift

Because the player is added to the DOM after the page loads, it will cause a cumulative layout shift, pushing content down and causing a jarring jump for your users. To prevent this, make sure your player has an aspectRatio style property. @mux/mux-player-react/lazy will display a placeholder with this aspect ratio while the player loads.


```jsx
<MuxPlayer
  playbackId="EcHgOK9coz5K4rjSwOkoE7Y7O01201YMIC200RI6lNxnhs"
  // without this line, the player will cause a layout shift when it loads
  style={{ aspectRatio: 16/9 }}
/>
```


Customizing the placeholder

While Mux Player React Lazy loads, it will display a placeholder with the same background color as the player. (By default, a black background).

<Player
  playbackId="Wd01CoLZp2Adx00qefHtyGVPSP2h4wO33OZqR00vf7wCnQ"
  style={{ aspectRatio: "495 / 274", '--center-controls': 'none' }}
/>

If the placeholder= attribute is defined, the attribute's contents will display in the placeholder before load. You can generate placeholders that match your video poster with @mux/blurup. See the placeholder guide to learn more.

<Player
  playbackId="bXA3Oh7v22fRBU013damYqUxFK6HrmJcrI00Q00b2OSvmc"
  style={{ aspectRatio: "656 / 277", '--center-controls': 'none' }}
/>

Defining when to load

In addition to the standard attributes that Mux Player React accepts, Mux Player React Lazy will also accept a loading attribute:

- loading="page": Loads the player and replaces a placeholder after the page loads and the initial JavaScript bundle is executed
- loading="viewport": (Default) Extends loading="page" by also waiting until the placeholder has entered the viewport

Using other frameworks

If you are working in an environment that supports dynamic imports, like Webpack, Rollup, Parcel, or many modern browsers, you can reproduce the behavior of Mux Player React Lazy.

If you have access to a Node.js server, generate a placeholder that matches your video with @mux/blurup.


```js
// Server-Side
import { createBlurUp } from '@mux/blurup';

const options = {};
const muxPlaybackId = 'O6LdRc0112FEJXH00bGsN9Q31yu5EIVHTgjTKRkKtEq1k';

const getPlaceholder() = async () => {
  const { blurDataURL, aspectRatio } = await createBlurUp(muxPlaybackId, options);
  console.log(blurDataURL, aspectRatio);
  // data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" ...
};
```


Then, use a dynamic import to load Mux Player. When the load is complete, replace the placeholder with the player.
