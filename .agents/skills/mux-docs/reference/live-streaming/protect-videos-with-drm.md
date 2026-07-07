# Protect videos with DRM

**Source:** https://mux.com/docs/_guides/developer/protect-videos-with-drm

Check out our blog on "What is DRM" to learn more about the concepts of DRM.

DRM (Digital Rights Management) provides an extra layer of content security for video content streamed from Mux.

Leveraging DRM blocks or limits the impact of:

- Screen recording
- Screen sharing
- Downloading tools

Mux uses the industry standard protocols for delivering DRM protected video content, specifically Google Widevine, Microsoft PlayReady, and Apple FairPlay.

DRM requires the use of Signed URLs, and when combined with Domain and User-Agent restrictions, can provide a very strong content protection story, up to and including security levels that satisfy the requirements of Hollywood studios.

How Mux DRM Protects Your Content

Mux Video's DRM is built to support the strongest protection available for each device without affecting playability. This protection comes in three parts.

- Video encryption: ensures you can't play the video without the proper license.
- Screen capture protection: ensures that you can't take screenshots or record the screen.
- HDCP: prevents recording video from video outputs like HDMI.

However, not every device supports all three protection layers. Mux has configured DRM at a security level that ensures broad device compatibility while still providing meaningful protection. The following table shows the types of protection you can expect across different devices:

| Device Type | Encrypted Video | Screen Capture Protection | HDCP Enforced | Details |
| ----- | ----- | ----- | ----- | ----- |
| iPhone/iPad | ✅ Yes | ✅ Yes | ✅ Yes | Apple supports hardware-level protection on all devices created since the iPhone 5s. |
| Modern Android devices | ✅ Yes | ✅ Usually | ❌ No | Newer devices such as Google Pixel phones or Samsung phones with Android 12+, or any device with Widevine level 1 support can prevent screen capture. |
| Older, and lower end Android devices | ✅ Yes |  Sometimes | ❌ No | Many lower end Android devices are missing the secure hardware necessary for Widevine level 3 and hardware decryption. Many of these lower end devices still try to block screen capture, but it's not nearly as secure. |
| Chrome/Edge browsers on desktop | ✅ Yes | Sometimes | ❌ No | Browser-based playback usually relies on software decryption. Many of these devices still try to block screen capture but it's not nearly as secure. |

Additional protections

If you're distributing premium content with strict security requirements (like major studio releases), you may need additional types of protection. For this you have a few options:

 Device-level security upgrades: Some players allow you to request stronger DRM when devices support it. This ensures hardware-backed devices get enhanced protection while others play at baseline levels.
 Custom DRM configuration: We're investigating more granular security controls and looking for early partners to help test these features. Reach out for more information.
 Video watermarking: Add visible watermarks using Mux's watermarking feature, which embeds them directly into the video and prevents misattribution. This doesn't support per-user or forensic watermarking, but you can add per-user watermarks by overlaying images on your player - just know these are easier to bypass since they're not baked into the video. Forensic watermarking isn't currently available, but if it would be valuable for your use case, let us know.  We'd love to hear your feedback.
 Trust the DRM Configuration: Attempting to increase security by detecting device capabilities or security levels yourself will be painful. The device landscape changes constantly and maintaining accuracy is nearly impossible. This is better addressed with custom DRM configurations.

If you need any of these additional protections, or something we've overlooked, contact us. We'd love to hear from you.

Before you can start using Mux DRM you must complete the onboarding process. The following is a quick overview of the entire process, and you can find additional detail later in this guide.

1. Request a FairPlay certificate for playback on Apple Devices. Don't worry about Widevine and PlayReady certificates, we'll handle those for you.
2. While waiting on FairPlay approval, go to Settings -> Digital Rights Management in your Mux dashboard to request DRM access.
3. After DRM is enabled on your environments we'll send you a DRM configuration ID and tell you how to securely send us your FairPlay certificates.

Once these steps are complete you will have your DRM configuration ID and be able to test DRM playback on non-Apple devices. Once you've sent us your FairPlay certificates you can test on Apple devices.

Step 1: Request a FairPlay certificate

DRM playback will work out of the box on every supported platform except for Apple devices. Apple requires you to request your own FairPlay Streaming Deployment package (FPS, often simply referred to as a "FairPlay Certificate"). An FPS can only be requested if you meet the following requirements.

1. You have an Apple Developer account with an active subscription.
2. If you're part of a team account, you are logged in as the owner of a team account.

Once you've met these requirements, you will need to fill out a form. The initial questions ask about your DRM infrastructure, which is Mux. Here's some guidance on how to answer those questions.

|    |    |
| :---- | :---- |
| Does your organization have a working FPS development server where you'll use the FPS certificate? | Select "Yes" You will use Mux's verified FPS implementation. |
| Do you have a third-party streaming distribution partner? | Select "Yes". Mux is that third-party partner. |
| Streaming Distribution (DRM License Server) Partner Name | Enter "Mux, Inc.". |
| Streaming Distribution (DRM License Server) Partner Website | Enter "https://mux.com". |
| Your Company | Describe your company and the services they provide. |
| Your Content | Describe the type of content you will be protecting with FairPlay and why that content needs DRM. |
| Do you own the content you want to stream? | If you hold full copyright ownership of your content, select "Yes". Otherwise select "No" and answer the following two additional questions that appear: |
| Do you have a content licensing agreement with the owner of the content? | If you license third-party content, select "Yes". |
| Your Content Provider | If you license third-party content, include the name of that provider and a description of the rights you have to use their content. |
| Is this your first request for FPS credentials? | If this is your first time submitting this form or requesting a FairPlay certificate, select "Yes".
| Do you assert that the account holder of this developer account owns, or has a license to use, the content that you will be streaming? | Select the most appropriate answer for your situation. |

Once you've submitted the request, approval may take several days. Once approved, Apple will provide documentation for generating the final certificate. This includes generating a private key via your terminal and filling out a form.

Once you've created your FairPlay deployment package, contact us and we'll walk you through securely sending us the files.

  You do not need to request a Widevine or PlayReady certificate, Mux manages these for you.

Step 2: Request DRM for your environment

Go to Settings -> Digital Rights Management to request DRM access. This page will walk you through the necessary requirements and allow you to request access. You will receive a response via email with next steps.

Step 3: Receive your DRM configuration ID

After we enable DRM on your environment you can find your DRM configuration ID in Settings -> Digital Rights Management. You'll need this when you add a DRM playback ID to an asset.

You can also use the DRM Configurations API to list the DRM Configurations available to your account.

Mux Video supports applying DRM to both live streams and assets.

Creating a DRM protected asset

When using the Create Asset API, you can add DRM protection by including advanced_playback_policies with your DRM configuration ID. Make sure to set the video_quality to plus or premium, as DRM is only supported on these quality levels.


```json
// POST /video/v1/assets
{
  "inputs": [
    {
      "url": "https://storage.googleapis.com/muxdemofiles/mux.mp4"
    }
  ],
  "advanced_playback_policies": [
    {
      "policy": "drm",
      "drm_configuration_id": "your-drm-configuration-id"
    }
  ],
  "video_quality": "plus"
}
```


When working with advanced_playback_policies, keep in mind that you can't use both the playback_policy field and advanced_playback_policies field in the same request. When working with DRM, stick to advanced_playback_policies. If you need more than one playback policy, such as for static renditions, you can include multiple policies in the advanced_playback_policies array.

If you need to add DRM protection to an existing asset, you can use the Playback IDs API to retroactively add a DRM playback policy. This works for any asset created after DRM was enabled in your environment.
Creating a DRM protected live stream

Just like creating a DRM protected asset, DRM protected live streams require configuration ID must be set in the live stream's advanced_playback_policies.

In the example below, we also set the new_asset_settings to also use DRM, so any DVR assets and on-demand assets also have DRM applied.


```json
// POST /video/v1/live-streams
{
  "advanced_playback_policies": [
    {
      "policy": "drm",
      "drm_configuration_id": "your-drm-configuration-id"
    }
  ],
  "new_asset_settings": {
    "advanced_playback_policies": [
      {
        "policy": "drm",
        "drm_configuration_id": "your-drm-configuration-id"
      }
    ]
  }
}
```


Mux supports three types of DRM: Widevine, FairPlay, and PlayReady. These three DRM systems cover the vast majority of devices in use today, including desktop browsers, mobile browsers, and living room devices (OTT).

Supported Platforms

Before you start to build your DRM integration, make sure Mux's DRM supports your target platforms. Mux's DRM is verified to work on all of the following platforms, but likely works on additional platforms. If you would like us to verify an additional platform, please contact us.

Desktop Browsers
The following desktop browsers support Mux DRM via the Mux Web Player, or any of the players listed in our player documentation.
- Chrome (macOS and Windows)
- Firefox (macOS and Windows)
- Safari (macOS)
- Edge (Windows)
- Legacy Edge (Windows)

Mobile Browsers
The following mobile browsers support Mux DRM via the Mux Web Player, or any of the players listed in our player documentation.
- Chrome on Android
- Firefox on Android
- All browsers on iOS

Native Mobile Apps
- Android apps using Mux Player for Android
- iOS apps using Mux Player for iOS

Living room devices (OTT)
The following living room devices support Mux DRM, and link to the relevant documentation.
- Chromecast
- Google TV
- Apple TV (tvOS)
- Roku
- Fire TV

Creating your playback and license tokens

To successfully play back content protected by Mux DRM you will need your asset's playback ID and two secure tokens; a playback token and a DRM license token. These tokens are both signed using the JWT requirements laid out in our secure video playback guide.

If you're using our node library to sign your license URLs we offer a helper function:

```js
const mux = new Mux({
  tokenId: "your-access-token-id",
  tokenSecret: "your-access-token-secret",
  jwtSigningKey: "your-environment-signing-public-key",
  jwtPrivateKey: "your-environment-signing-private-key"
});

const playbackToken = await mux.jwt.signPlaybackId("your-playback-id", {expiration: '7d'});
const drmLicenseToken = await mux.jwt.signDrmLicense("your-playback-id", {expiration: '7d'});
```


Once you have created your signing tokens, you can use them directly in a Mux player. If you are using a non-Mux player you use these tokens to build your playback and license URLs.

Playback in Mux players

Now that you have the necessary tokens, we can hook them into a Mux Player.

Mux Web Player

To play back DRM protected content, you should instantiate the player with the new drm-token parameter set to the DRM license token that you generated previously. In Mux Player React, you'll use the tokens prop to set the drm token.

  Support for DRM in Mux Player was added in version 2.8.0.

<CodeExamples
    product="player"
    example="tokensDrm"
    exampleOrder="html,react,embed"
/>

You can see a demo of this working in codesandbox here.

With your new tokens all wired up correctly, you should be able to play back your freshly DRM protected content!

Here's a demo page with some pre-prepared DRM protected content you can also test a device against.

Full documentation for using DRM with Mux Player for web can be found here.

Mux Player iOS

  Support for DRM in Mux Player for iOS was added in version 1.1.0.

The DRM license token can be configured on PlaybackOptions using the following API:


```swift
let playbackOptions = PlaybackOptions(
  drmToken: "your-drm-license-token",
  playbackToken: "your-playback-token",
)

let playerItem = AVPlayerItem(
  playbackID: "your-playback-id",
  playbackOptions: playbackOptions
)
```


Full documentation for using DRM Mux Player for iOS can be found here.

Mux Player Android
The DRM license token can be configured when instantiating a MediaItem using the MediaItems factory class as follows:

  Support for DRM in Mux Player for Android was added in version 1.1.0.


```kotlin
// You don't need to add your own DrmSessionManager, we take care of this

val player = // Whatever you were already doing

val mediaItem = MediaItems.mediaItemFromPlaybackId(
  playbackId = "your-playback-id",
  playbackToken = "your-playback-token",
  drmToken = "your-drm-license-token"
)

// Normal media3 boilerplate
player.setMediaItem(mediaItem)
player.prepare()
```


Full documentation for using DRM Mux Player for Android can be found here.

Playback in third-party players
If you can't use one of the Mux players, you still have options. Mux's DRM is compatible with a wide range of third party players. Because these players don't know exactly how Mux's DRM works, you'll need to build the correct playback and license URLs, then add them to the player.

Creating license URLs
The following examples demonstrate the license URL structure for each of the supported DRM providers.

Widevine


```
https://license.mux.com/license/widevine/{playback-id}?token={drm-license-token}
```


FairPlay

Before you can use FairPlay DRM, you must request the proper certificate from Apple. Once FairPlay is enabled on your account, you will use one license url and one certificate URL.

License URL


```
https://license.mux.com/license/fairplay/{playback-id}?token={drm-license-token}
```


Certificate URL


```

https://license.mux.com/appcert/fairplay/{playback-id}?token={drm-license-token}
```


PlayReady


```
https://license.mux.com/license/playready/{playback-id}?token={drm-license-token}
```


Third party players
The following third-party players have been tested with Mux DRM. If you are using a player not listed here, check out our notes on other players.

Roku

In order to play back DRM protected content in Roku, add your DRM Configuration to your content node. This includes the following:

1. Add the following two fields to your channel's manifest:

```jsx
    requires_widevine_drm=1
    requires_widevine_version=1.0
    ```

2. When preparing your contentNode, ensure you reference the DRM configuration and license URL as follows:


```jsx
drmParams = {
  keySystem: "Widevine",
  licenseServerURL: "https://license.mux.com/license/widevine/${PLAYBACK_ID}?token=${DRM_LICENSE_JWT}"
}

contentNode = CreateObject("roSGNode", "ContentNode")
contentNode.url = "<content URL>"
contentNode.drmParams = drmParams
contentNode.title = "<your title>"
contentNode.length = <duration in seconds>

' other contentNode properties can be added here,
' then play your video as you normally would
```


Chromecast
Chromecast devices use Google Cast to send videos from one device to another. There are quite a few steps to set up Google Cast, so we recommend you check out our Google Cast guide for more details.

HLS.js

HLS.js supports DRM via configuration keys in any browser with native MSE support (e.g. old versions of Safari). For browsers that do not support MSE, you will need to use the native video element. Both flows are included in the example below.


```js
// This browser supports MSE and EME, so we can use hls.js
if (Hls.isSupported()) {
  var hls = new Hls({
    emeEnabled: true,
    drmSystems: {
      'com.widevine.alpha': {
        licenseUrl: 'https://license.mux.com/license/widevine/${PLAYBACK_ID}?token=${DRM_LICENSE_TOKEN}'
      },
      'com.microsoft.playready': {
        licenseUrl: 'https://license.mux.com/license/playready/${PLAYBACK_ID}?token=${DRM_LICENSE_TOKEN}'
      },
      'com.apple.fps': {
        licenseUrl: 'https://license.mux.com/license/fairplay/${PLAYBACK_ID}?token=${DRM_LICENSE_TOKEN}',
        serverCertificateUrl: 'https://license.mux.com/appcert/fairplay/${PLAYBACK_ID}?token=${DRM_LICENSE_TOKEN}',
      }
    }
  });
// This browser supports EME but not MSE, so we need to use the native video element
} else if (video.canPlayType('application/x-mpegURL')) {
  video.src = mediaUrl;

  video.addEventListener('encrypted', async function(event) {
    const initDataType = event.initDataType;
    const initData = event.initData;

    // Retrieve a MediaKeySystemAccess object to interact with the DRM system
    const access = await navigator.requestMediaKeySystemAccess('com.apple.fps', [{
        initDataTypes: [initDataType],
        videoCapabilities: [{ contentType: 'application/vnd.apple.mpegurl', robustness: '' }],
        distinctiveIdentifier: 'not-allowed',
        persistentState: 'not-allowed',
        sessionTypes: ['temporary'],
    }]);

    if (!access) {
        console.error('Cannot play DRM-protected content with current security configuration on this browser. Try playing in another browser.');
        return;
    }

    // Create DRM keys
    const keys = await access.createMediaKeys();

    // Get the FairPlay license and certificate
    const certificate = await fetch('https://license.mux.com/appcert/fairplay/${PLAYBACK_ID}?token=${DRM_LICENSE_TOKEN}').then(async (res) => {
        const keyBuffer = await res.arrayBuffer();
        return new Uint8Array(keyBuffer);
    });

    if (!certificate) {
        console.error('Failed to fetch certificate');
        return;
    }

    // Attach the certificate to the DRM keys
    await keys.setServerCertificate(certificate);

    // Attach the keys to the video element
    await video.setMediaKeys(keys);

    // Create a playback session
    const session = (video.mediaKeys).createSession();

    // Create the data necessary to make a DRM license request
    const message = await new Promise((resolve, reject) => {
        session.generateRequest(initDataType, initData);
        session.addEventListener('message', (messageEvent) => {
            resolve(messageEvent.message);
        }, { once: true });
    });

    // Get a DRM license
    const response = await fetch('https://license.mux.com/license/fairplay/${PLAYBACK_ID}?token=${DRM_LICENSE_TOKEN}', {
        method: 'POST',
        headers: { 'Content-type': 'application/octet-stream' },
        body: message,
    });

    // Attach the license key to the session
    const licenseData = await response.arrayBuffer();
    await session.update(licenseData);
  });
}
```


For more details, check out the HLS.js DRM docs.

Video.js

Video.js supports DRM via the videojs-contrib-eme plugin.


```js
const player = videojs('vid1', {});

player.eme();
player.src({
  src: 'https://stream.mux.com/{playback-id}.m3u8?token={JWT}',
  type: 'application/x-mpegURL',
  keySystems: {
    'com.widevine.alpha': 'https://license.mux.com/license/widevine/${PLAYBACK_ID}?token=${DRM_LICENSE_TOKEN}',
    'com.apple.fps.1_0': {
      certificateUri: 'https://license.mux.com/appcert/fairplay/${PLAYBACK_ID}?token=${DRM_LICENSE_TOKEN}',
      licenseUri: 'https://license.mux.com/license/fairplay/${PLAYBACK_ID}?token=${DRM_LICENSE_TOKEN}',
    },
    'com.microsoft.playready': 'https://license.mux.com/license/playready/${PLAYBACK_ID}?token=${DRM_LICENSE_TOKEN}'
  }
});
```


For more details check, out the videojs-contrib-eme docs.

Shaka player

Shaka player supports DRM via configuration keys.


```js
player.configure({
  drm: {
    servers: {
      'com.widevine.alpha': 'https://license.mux.com/license/widevine/${PLAYBACK_ID}?token=${DRM_LICENSE_TOKEN}',
      'com.apple.fps.1_0': 'https://license.mux.com/license/fairplay/${PLAYBACK_ID}?token=${DRM_LICENSE_TOKEN}',
      'com.microsoft.playready': 'https://license.mux.com/license/playready/${PLAYBACK_ID}?token=${DRM_LICENSE_TOKEN}'
    },
    advanced: {
      'com.apple.fps.1_0': {
        serverCertificateUri: 'https://license.mux.com/appcert/fairplay/${PLAYBACK_ID}?token=${DRM_LICENSE_TOKEN}'
      }
    }
  }
});
```


For more details, check out the Shaka player DRM docs.

Other players

While we have only tested playback with our supported players, there are many others that will work just fine. If your platform supports playback of HLS, CMAF packaged streams, with Widevine, PlayReady, or FairPlay DRM, using CBCS encryption, then Mux might work by following the custom players guide. If you would like us to support additional platforms, let us know.

Testing that DRM is working

Checking your video is DRM protected is pretty simple: just take a screenshot! If DRM is working correctly, you should see the video replaced with either a black rectangle, or a single frame from the start of the video.

Currently Mux's DRM feature defaults to a balance of security and playability, including automatically leveraging higher security levels on devices where this is available.

At times customers may want to adjust this balance to increase security levels, specifically for example to meet contractual Hollywood studio security requirements. Please contact us if you need to discuss or adjust the security levels used.

In the future, we will allow self-serve adjustment of security levels through the DRM Configurations API.

In line with common industry practices, only video tracks are currently DRM protected, meaning that audio-only assets and audio-only live streams are not protected by DRM.

DRM is an add-on feature to Mux Video, with a $100/month access fee + $0.003 "per license", and discounts available for high volumes.

What is a DRM license?
One DRM license request typically corresponds to one video view. When a viewer starts watching a DRM-protected video, the player requests a license to decrypt and play the content. While licenses and video views usually line up, the exact count can vary depending on each player's caching behavior.
