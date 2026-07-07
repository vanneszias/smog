# Add high-performance video to your Node application

**Source:** https://mux.com/docs/_guides/integrations/mux-node-sdk

Installation

Add a dependency on the @mux/mux-node package via npm or yarn.


```bash
npm install @mux/mux-node
```


Quickstart

To start, you'll need a Mux access token. Once you've got that, you're off to the races!


```javascript
import Mux from '@mux/mux-node';
const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET
});

const asset = await mux.video.assets.create({
  input: [{ url: 'https://storage.googleapis.com/muxdemofiles/mux-video-intro.mp4' }],
  playback_policy: ['public'],
});
```


Full documentation
Check out the Mux Node SDK docs for more information.
