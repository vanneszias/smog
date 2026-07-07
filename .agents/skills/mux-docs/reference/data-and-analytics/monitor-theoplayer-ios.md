# Monitor THEOplayer (iOS)

**Source:** https://mux.com/docs/_guides/developer/monitor-theoplayer-ios

Requirements:

 THEOplayer.xcframework SDK for iOS (> 5.9)
 A working implementation of THEOplayer in your iOS app

Before integrating Mux-Stats-THEOplayer into your player, first make sure your THEOplayer implementation is working as expected.

Add Mux-Stats-THEOplayer to your podfile


```
pod 'Mux-Stats-THEOplayer', '~> 0.8'
```


Run pod install then import MuxCore and MUXSDKStatsTHEOplayer modules into your application. Call monitorTHEOplayer and pass in a reference to your THEOplayer instance.

Below is an example configuration for a simple THEOplayer implementation. The key part to pay attention to is monitorTHEOplayer. This example is using ads with THEOplayer, which will also be tracked with Mux Data.


```swift
import MuxCore
import MUXSDKStatsTHEOplayer
import THEOplayerSDK
import UIKit

class ViewController: UIViewController {
    let playerName = "demoplayer"
    var player: THEOplayer!

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        self.player = THEOplayer(configuration: THEOplayerConfiguration(chromeless: false))
        self.player.frame = view.bounds
        self.player.addAsSubview(of: view)

        let typedSource = TypedSource(
            src: "https://stream.mux.com/tqe4KzdxU6GLc8oowshXgm019ibzhEX3k.m3u8",
            type: "application/vnd.apple.mpegurl")

        let ad = THEOAdDescription(src: "https://pubads.g.doubleclick.net/gampad/ads?sz=640x480&iu=/124319096/external/ad_rule_samples&ciu_szs=300x250&ad_rule=1&impl=s&gdfp_req=1&env=vp&output=vmap&unviewed_position_start=1&cust_params=deployment%3Ddevsite%26sample_ar%3Dpremidpostpod&cmsid=496&vid=short_onecue&correlator=")

        let source = SourceDescription(source: typedSource, ads: [ad], textTracks: nil, poster: nil, analytics: nil, metadata: nil)
        self.player.source = source

        // TODO: Add your env key
        let playerData = MUXSDKCustomerPlayerData(environmentKey: "ENV_KEY")!

        let videoData = MUXSDKCustomerVideoData()
        videoData.videoTitle = "Big Buck Bunny"
        videoData.videoId = "bigbuckbunny"
        videoData.videoSeries = "animation"

        MUXSDKStatsTHEOplayer.monitorTHEOplayer(self.player, name: playerName, playerData: playerData, videoData: videoData, softwareVersion: "1.1.1")
        self.player.play()
    }
}
```


The only required field is env_key. But without some more metadata the metrics in your dashboard will lack the necessary information to take meaningful actions. Metadata allows you to search and filter on important fields in order to diagnose issues and optimize the playback experience for your end users.

Metadata fields are provided via the MUXSDKCustomerPlayerData and MUXSDKCustomerVideoData objects.

For the full list of properties view the header files for this interfaces:

- MUXSDKCustomerPlayerData.h
- MUXSDKCustomerVideoData.h

For more details about each property, view the Make your data actionable guide.


```swift
let playName = "iOS AVPlayer"
let playerData = MUXSDKCustomerPlayerData(environmentKey: "ENV_KEY");
playerData.viewerUserId = "1234"
playerData.experimentName = "player_test_A"
// note that the 'playerName' field here is unrelated to the 'playName' variable above
playerData.playerName = "My Main Player"
playerData.playerVersion = "1.0.0"

let videoData = MUXSDKCustomerVideoData();
videoData.videoId = "abcd123"
videoData.videoTitle = "My Great Video"
videoData.videoSeries = "Weekly Great Videos"
videoData.videoDuration = 120000 // in milliseconds
videoData.videoIsLive = false
videoData.videoCdn = "cdn"


MUXSDKStatsTHEOplayer.monitorTHEOplayer(self.player, name: playerName, playerData: playerData, videoData: videoData, softwareVersion: "1.1.1")
self.player.play()
```


Changing the video
If you want to change the video in the player, you'll need to let the Mux SDK know by calling videoChangeForPlayer. From the perspective of Mux Data, this will create a new view.


```swift
let videoData = MUXSDKCustomerVideoData()
videoData.videoTitle = "New Video"
videoData.videoId = "newVideoId"
MUXSDKStatsTHEOplayer.videoChangeForPlayer(name: self.playerName, videoData: videoData)

let typedSource = TypedSource(src: "https://stream.mux.com/tNrV028WTqCOa02zsveBdNwouzgZTbWx5x.m3u8", type: "application/vnd.apple.mpegurl")
let source = SourceDescription(source: typedSource, ads: [], textTracks: nil, poster: nil, analytics: nil, metadata: nil)
self.player.source = source
self.player.play()
```


Handling Errors manually

By default, automaticErrorTracking is enabled which means the Mux SDK will catch errors that the player throws and track an error event. Error tracking is meant for fatal errors. When an error is thrown it will mark the view as having encountered an error in the Mux dashboard and the view will no longer be monitored.

If you want to disable automatic and track errors manually you can do by passing in automaticErrorTracking false when calling monitorTHEOplayer

Whether automatic error tracking is enabled or disabled, you can dispatch errors manually with dispatchError.


```swift
MUXSDKStatsTHEOplayer.monitorTHEOplayer(self.player, name: playerName, playerData: playerData, videoData: videoData, softwareVersion: "1.1.1", automaticErrorTracking: false)
MUXSDKStatsTHEOplayer.dispatchError(name: playerName, code: "1234", message: "Something is not right")
```


Current release

v0.12.0
- Update range of supported THEOplayer versions to major version 8

Previous Releases

v0.11.0
- Relax THEOplayer version constraint to allow installation alongside any version of THEOplayer whose major version is 7
- Add an ads integration presence check to remove console warning when no ads integration is present

v0.10.0
- Support use in tvOS applications
- Update minimum supported THEOplayer dependency to 7.1.0
- Update pinned MuxCore dependency to 4.7.1

v0.9.0
- Update minimum supported THEOplayer dependency to 6.12.1
- Update pinned MuxCore dependency to 4.7.0
- The minimum deployment target is now iOS 12.0

v0.8.0
- Add support for THEOplayer 5.9 and above
- Add support for installation with Swift Package Manager

v0.7.0
- Remove the THEOplayerSDK.framework from build artifact
- Add THEOplayerSDK.framework to .gitignore

v0.6.0
- Add MUXSDKCustomerData
- Custom data support through customer data object

v0.5.0
- Update to use xcframeworks to provide Xcode 13 and M1 compatibility

v0.4.1
- Fix an issue where an error message could be wrongly set when an AdError occurs

v0.4.0
- Fix an issue with error message and code in AdError events
- Fix compatibility with Xcode 12

v0.3.0
- Add error code tracking as well as error message when handling errors
- Bump the required THEOplayer.framework SDK for iOS to > v2.76

v0.2.0
- Add option to disable automatic error tracking when calling monitorTHEOplayer
- Add API to manually dispatch an error with MUXSDKStatsTHEOplayer.dispatchError

You probably will not need to use these features, but if your player is throwing noisy non-fatal errors or you want to catch the player errors yourself and take precise control over the error code and error message then you now have that ability.

- (bugfix) fix build script for frameworks for AppStore error ITMS-90562: Invalid Bundle in the CFBundleSupportedPlatforms plist
- (bugfix) fix crash that can happen when using Google IMA ads with THEOplayer

v0.1.0
- Initial release
