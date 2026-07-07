# Custom Swift integration

**Source:** https://mux.com/docs/_guides/developer/data-custom-swift-integration

Mux has a pre-built integration with Apple's AVPlayer for iOS, tvOS, visionOS, and Mac Catalyst applications; for these players, see here: iOS Integration Guide.

If the player that you use does not expose the AVPlayer instance directly, swaps between multiple instances during playback, or uses some other playback mechanism completely, a custom integration may be needed.

Important Related Docs
Before proceeding, read the following overview: Building a Custom Integration.

In addition, the source code for Mux's integration with Apple's AVPlayer is open source and can be found in the Mux-Stats-AVPlayer GitHub repository. This project is a good example of how to use the Apple core library in building a player integration.

Installing in Xcode with Swift Package Manager

1. In your Xcode project click File > Add Package Dependencies...
2. In the top-right corner of the modal window paste in the SDK repository URL:


```text
   https://github.com/muxinc/stats-sdk-objc.git
   ```


3. Choose a Dependency Rule. Since MuxCore follows SemVer, we recommend using Up to Next Major starting from 5.0.0. Here's an overview of the different SPM Dependency Rules and their semantics.
4. Click Add Package.

Installing in Package.swift

Open your Package.swift file, add the following to dependencies:


```swift
    .package(
      url: "https://github.com/muxinc/stats-sdk-objc",
      from: "5.11.0"
    ),
```


Swift Package Manager docs recommend this form, and it resolves the latest compatible 5.x release of MuxCore.

Installing with CocoaPods

To include the core Apple library via CocoaPods, add the following pod to your Podfile:


```ruby
pod "Mux-Stats-Core", "~> 5.0"
```


This will include our current release of the core Apple library. There will be no breaking updates within major versions of this library, so you can safely run pod update.

Since version 3, Mux-Stats-Core has been updated for Xcode 12 and XCFramework bundle type.

Including Manually (not preferred)

If you do not use CocoaPods or Swift Package Manager and wish to include the library manually, an XCFramework is included in each release on GitHub: Releases.

There is no need to initialize a player monitor for each player that is being tracked, as this happens automatically when events are emitted for a specific player. For the Apple core library, the Environment and Viewer-specific data should be emitted to the SDK globally as follows.


```swift
let environmentData = MUXSDKEnvironmentData()
environmentData.muxViewerId = UIDevice.current.identifierForVendor?.uuidString

let viewerData = MUXSDKViewerData()
viewerData.viewerApplicationName = Bundle.main.bundleIdentifier
// Set additional Viewer data as above

let dataEvent = MUXSDKDataEvent()
dataEvent.environmentData = environmentData
dataEvent.viewerData = viewerData

MUXSDKCore.dispatchGlobalDataEvent(dataEvent)
```


The only field that should be modified within MUXSDKEnvironmentData is the muxViewerId, which should be a device-specific string. This field is used within the Mux Dashboard as the Viewer ID in the case that a user-specific value is not provided in the metadata.

If you are monitoring playback and delivery of Mux Video assets, you may opt-in to Mux Data inferring your environment details from player HTTP traffic. To opt-in, initialize MUXSDKCustomerPlayerData with environmentKey set to nil.

MUXSDKViewerData is where you can provide app, device, OS, and connection information such as application name/version, device model/category, OS family/version, and connection type. For the current public field list, inspect the headers in the latest MuxCore release.

See the AVPlayer integration for example values used in a production Apple integration.

For the Apple core SDK, there are two types of events that should be emitted: data events and playback events. Data events are events that update metadata about the video or view, whereas playback events are those described here: Mux Playback Events.

All events are emitted to a specific Player, so make sure to include the unique player ID with each event emitted.

Data Events
Data events are emitted via MUXSDKCore.dispatchEvent(_:forPlayer:), and should be emitted when any of the following pieces of metadata change:

MUXSDKVideoData fields commonly updated by custom integrations include:

| Property | Description |
| --- | --- |
| videoSourceWidth | Width of the video currently being played, in pixels |
| videoSourceHeight | Height of the video currently being played, in pixels |
| videoSourceIsLive | Whether the video currently being played is live or not |
| videoSourceDuration | The duration, in milliseconds, of the video currently being played |
| videoSourceAdvertisedBitrate | The bitrate of the current rendition being played, in bits per second |
| videoSourceFrameDrops | The total number of dropped video frames for the current View |

Other metadata that should also be sent via data events when it changes:
 - MUXSDKCustomerPlayerData
 - MUXSDKCustomerVideoData
 - MUXSDKCustomerViewData
 - MUXSDKCustomerViewerData
 - MUXSDKCustomData

For more details on the customer metadata models, see Make your data actionable. For the current public field list across the Apple SDK headers, inspect the latest MuxCore release.

When any of the above fields change, do the following:
 - Create one or more instances of MUXSDKVideoData, MUXSDKCustomerPlayerData, MUXSDKCustomerVideoData, and MUXSDKCustomerViewData depending on what changed
 - Assign all properties with the most recent value via the helper methods to the appropriate instance of data
 - Attach these to an instance of MUXSDKDataEvent
 - Emit this MUXSDKDataEvent via MUXSDKCore.dispatchEvent(_:forPlayer:)

For example, when the resolution of the video being played back changes (such as in adaptive streaming), the following should be done:


```swift
// Prepare the data update
let videoData = MUXSDKVideoData()
videoData.videoSourceWidth = width as NSNumber
videoData.videoSourceHeight = height as NSNumber

// Put it within a MUXSDKDataEvent
let dataEvent = MUXSDKDataEvent()
dataEvent.videoData = videoData

// Emit the event
MUXSDKCore.dispatchEvent(dataEvent, forPlayer: playerName)
```


Playback Events
The Mux Playback Events should be emitted as the events are defined in the referenced document. With regards to naming, the names align with those in the document, with the following changes: MUXSDK is appended in front of the name, the name itself is PascalCased, and Event is appended at the end. For instance, for playerready, the corresponding event is MUXSDKPlayerReadyEvent.

With each playback event that is emitted, the following fields within MUXSDKPlayerData should be included with the latest values:

| Property | Description |
| --- | --- |
| playerMuxPluginName | The name of the integration being built, as a string |
| playerMuxPluginVersion | The version of the integration being built, as a string |
| playerSoftwareName | The name of the player software (for example AVPlayer or your custom player name) |
| playerLanguageCode | The language code, such as en-US, of the player UI localization |
| playerWidth | The width of the player, in logical pixels |
| playerHeight | The height of the player, in logical pixels |
| playerIsFullscreen | Whether the player is currently displayed in fullscreen |
| playerIsPaused | Whether the player is currently paused, meaning not playing or trying to play |
| playerPlayheadTime | The current playhead time of the player, in milliseconds |

MUXSDKPlayerData also exposes additional fields beyond the required set above. For the current public field list, inspect the headers in the latest MuxCore release.

For instance, when emitting the MUXSDKPlayerReadyEvent, it should look like the following:


```swift
// Get the player data
let playerData = MUXSDKPlayerData()

// Set the player data information
playerData.playerMuxPluginName = "Sample Custom Player"
// ... repeat the above for all values within `MUXSDKPlayerData`

// Emit the event
let event = MUXSDKPlayerReadyEvent()
event.playerData = playerData

MUXSDKCore.dispatchEvent(event, forPlayer: playerName)
```


In addition to the above data fields, for ad and network events there are additional data fields that should be sent. These are documented alongside the events described in Mux Playback Events, and follow similar naming conventions.

In particular:
 - Network throughput events should be emitted as MUXSDKRequestBandwidthEvents, with the addition of MUXSDKBandwidthMetricData set on the event via bandwidthMetricData
 - If your player gives you access to your stream's rendition list, you can use the renditionLists property of MUXSDKBandwidthMetricData to track a stream's renditions with their resolution, framerate, bitrate, and RFC CODECS tag (ref)
 - Ad events are emitted via a special method, dispatchAdEvent, and details can be seen within Mux's IMA integration for AVPlayer

Lastly, for the MUXSDKRenditionChangeEvent, you should make sure to dispatch a MUXSDKDataEvent with the latest updated MUXSDKVideoData immediately before dispatching the MUXSDKRenditionChangeEvent.

Sample event sequence

There are multiple steps in setting up and tracking a view correctly. A very simple sequence of events to track a basic playback would look like the following steps:

1. Dispatch a global data event with the environment and viewer data
1. Dispatch the MUXSDKViewInitEvent with the current state of the player and video
1. Dispatch a MUXSDKDataEvent with the updated MUXSDKCustomerVideoData and MUXSDKCustomerPlayerData for the current video view
1. Dispatch the rest of the Mux Playback Events (e.g. MUXSDKPlayerReadyEvent, MUXSDKPlayEvent, MUXSDKPlayingEvent, MUXSDKTimeUpdateEvent, etc), each time with the updated current state of the player

Note: For each Playback Event and MUXSDKViewInitEvent that is dispatched, the current state of the player and video data (MUXSDKPlayerData and MUXSDKVideoData) should be attached to the event prior to dispatching the event.


```swift
// First, emit the global data event setting up the information about
// the player. This will likely only be called once within your application
// and does not need to be called for each player that is tracked.
let globalDataEvent = MUXSDKDataEvent()
globalDataEvent.environmentData = environmentData
globalDataEvent.viewerData = viewerData
MUXSDKCore.dispatchGlobalDataEvent(globalDataEvent)

// Prepare the view before you emit any other playback events
let viewInitEvent = MUXSDKViewInitEvent()
viewInitEvent.playerData = playerData
MUXSDKCore.dispatchEvent(viewInitEvent, forPlayer: playerName)

// Dispatch data about the view itself.
// Note: customerPlayerData must include your environment key.
let dataEvent = MUXSDKDataEvent()
dataEvent.customerPlayerData = customerPlayerData
dataEvent.customerVideoData = customerVideoData
MUXSDKCore.dispatchEvent(dataEvent, forPlayer: playerName)

// Emit playback events
let playerReadyEvent = MUXSDKPlayerReadyEvent()
playerReadyEvent.playerData = playerData
MUXSDKCore.dispatchEvent(playerReadyEvent, forPlayer: playerName)

// When the player begins to attempt playback
let playEvent = MUXSDKPlayEvent()
playEvent.playerData = playerData
MUXSDKCore.dispatchEvent(playEvent, forPlayer: playerName)

// When the player actually displays first moving frame
let playingEvent = MUXSDKPlayingEvent()
playingEvent.playerData = playerData
MUXSDKCore.dispatchEvent(playingEvent, forPlayer: playerName)

// ... and repeat for all of the playback events
```


Most of the events are signaled as listed above. However, there are a few cases of events that require additional work.

Reporting Network Conditions

Versions 5.8.0 and later include MUXSDKNetworkChangeEvent. This allows you to report changes in network connection type and optionally if the connection is in low data mode. This event should be posted as soon as network information is available after viewinit (MUXSDKViewInitEvent) and whenever connection type or low data mode changes.

A complete example implementation is available in the AVPlayer monitoring SDK's NetworkMonitor.swift.

For example:


```swift
let networkChangeEvent = MUXSDKNetworkChangeEvent(
  viewerConnectionType: .wifi,
  viewerConnectionIsLowDataMode: isLowDataMode as NSNumber?
)

MUXSDKCore.dispatchEvent(networkChangeEvent, forPlayer: playerName)
```


Changing the Video
In order to change the video within a player, there are a few events that need to be fired in sequence. You can see the implementation of this within the muxinc/mux-stats-sdk-avplayer code. You should do the following:
1. Dispatch a viewend event
2. Dispatch a viewinit event
3. Dispatch a MUXSDKDataEvent with the new video's MUXSDKCustomerVideoData, with the videoChange property set to true

If at various times the same underlying video stream needs to be monitored as effectively separate videos and separate Data views, two additional events, play and playing, need to be dispatched.

The following are the required steps from start to finish:
1. As before, dispatch a viewend event
2. As before, dispatch a viewinit event
3. As before, dispatch a MUXSDKDataEvent with the new video's MUXSDKCustomerVideoData, with the videoChange property set to true
4. Dispatch a play event
5. Dispatch a playing event


```swift
// 1. End the current view
let viewEndEvent = MUXSDKViewEndEvent()
viewEndEvent.playerData = playerData
MUXSDKCore.dispatchEvent(viewEndEvent, forPlayer: playerName)

// 2. Start the next view
let viewInitEvent = MUXSDKViewInitEvent()
viewInitEvent.playerData = playerData
MUXSDKCore.dispatchEvent(viewInitEvent, forPlayer: playerName)

// 3. Attach the new video's metadata and mark this as a video change
let dataEvent = MUXSDKDataEvent()
dataEvent.customerVideoData = customerVideoData
dataEvent.videoChange = true
MUXSDKCore.dispatchEvent(dataEvent, forPlayer: playerName)

// 4. If this should be tracked as a fresh view in the same stream,
// dispatch play
let playEvent = MUXSDKPlayEvent()
playEvent.playerData = playerData
MUXSDKCore.dispatchEvent(playEvent, forPlayer: playerName)

// 5. Then dispatch playing once the first moving frame is displayed
let playingEvent = MUXSDKPlayingEvent()
playingEvent.playerData = playerData
MUXSDKCore.dispatchEvent(playingEvent, forPlayer: playerName)
```


Sending Error events
Your custom integration is able to dispatch error events associated with the current view. These errors can get alerted on and are also visually indicated on the event timeline shown for that view.

When dispatching errors your custom integration can provide additional error metadata with Error Categorization. This section will cover several examples of dispatching errors using the Swift integration. You can find more general information on Error Categorization here.

Any error categories specified by your custom integration can be configured to be overridden based on the player error code. See the Error Categorization guide for more details.

This example dispatches an error event that Mux will categorize as a fatal playback error unless a different default for the player error code applies.


```swift
let errorEvent = MUXSDKErrorEvent(context: playerErrorContext)

// Configure any custom video or view data if necessary
let playerData = MUXSDKPlayerData()
playerData.playerErrorCode = playerErrorCode
playerData.playerErrorMessage = playerErrorMessage
playerData.playerPlayheadTime = playerPlayheadTime
errorEvent.playerData = playerData
// ... repeat for any other `MUXSDKPlayerData` properties if they've changed

MUXSDKCore.dispatchEvent(errorEvent, forPlayer: playerName)
```


This example dispatches an error that Mux will categorize as a warning unless a different default for the player error code applies.


```swift
let errorEvent = MUXSDKErrorEvent(severity: .warning, context: playerErrorContext)

// Configure any custom video or view data if necessary
let playerData = MUXSDKPlayerData()
playerData.playerErrorCode = playerErrorCode
playerData.playerErrorMessage = playerErrorMessage
playerData.playerPlayheadTime = playerPlayheadTime
errorEvent.playerData = playerData
// ... repeat for any other `MUXSDKPlayerData` properties if they've changed

MUXSDKCore.dispatchEvent(errorEvent, forPlayer: playerName)
```


This example dispatches an error that Mux will categorize as a business exception unless a different default for the player error code applies.


```swift
let errorEvent = MUXSDKErrorEvent(
  severity: playerErrorSeverity,
  isBusinessException: true,
  context: playerErrorContext
)

// Configure any custom video or view data if necessary
let playerData = MUXSDKPlayerData()
playerData.playerErrorCode = playerErrorCode
playerData.playerErrorMessage = playerErrorMessage
playerData.playerPlayheadTime = playerPlayheadTime
errorEvent.playerData = playerData
// ... repeat for any other `MUXSDKPlayerData` properties if they've changed

MUXSDKCore.dispatchEvent(errorEvent, forPlayer: playerName)
```


Destroying the Monitor
When you are tearing down the player and want to stop monitoring it, make sure to remove any listeners that you have on the player for sending events to MUXSDKCore. After this, make sure to call MUXSDKCore.destroyPlayer(_:) for the name of your player, so that the core library can clean up any monitoring and end the view session.


```swift
// Remove any listeners, observers, timers, polling, or other cleanup
// owned by your integration here.

// Finally, tell MuxCore that this player is no longer being monitored.
MUXSDKCore.destroyPlayer(playerName)
```


Current release

v5.11.0

Improvements:
 Track ranges of content played during a view via video_playback_range metric

Fixes:
 Resolves an issue where setting disablePlayheadRebufferTrackingForPlayerID(_:) could have no effect
 view_dropped_frame_count is now reported from both MUXSDKVideoData.videoSourceFrameDrops and MUXSDKViewData.viewDroppedFramesCount

Previous releases

v5.10.0

Improvements

 Continues tracking cumulative playing time after MUXSDKSeekedEvent and MUXSDKRebufferEndEvent when their playerData.playerIsPaused is true.
 Updates the constant value for MUXSDKConnectionTypeNoConnection

v5.9.0

Improvements
 Adds viewerDeviceName property to MUXSDKCustomerViewerData

v5.8.1

Fixes
 Resolves a leak (retain cycle) involving an internal class (MUXSDKCoreView).

v5.8.0

Improvements
 Adds MUXSDKNetworkChangeEvent and predefined values for connection type via MUXSDKConnectionType

v5.7.1

Fixes:
 Ensure playbackmodechange events are sent
 Restores tvOS-specific seeking detection behavior, where a best-effort attempt is made to count the preceding pause as part of the seek. This behavior was missing in 5.7.0, potentially causing changes in metrics.

v5.7.0

Updates:
 playbackmodechange event added for tracking changes to the presentation of a video (ie, fullscreen, pip, etc)
 Added timing metrics for playing time and ad playing time. These metrics track the wall-clock time spent playing (excluding startup time, rebuffering, seeking, etc)

Improvements:
 Added nullability annotations and nil-handling improvements to most public APIs
 Made most properties of MUXSDKPlayerData, MUXSDKVideoData, CustomerData, et al nonatomic
 Handle trackable events via typed delegate method
 Enable link-time optimization by thinLTO
 MUXSDKCore methods may now be called from any thread
 Numerous internal improvements

Fixes:
 Fix HTTP retry delay 1000x higher than intentional
 Wait for HTTP connectivity for beacons

v5.6.0

Improvements:
 Allow disabling playhead-based rebuffer tracking via -[MUXSDKCore disablePlayheadRebufferTrackingForPlayerID:] and manual dispatch of MUXSDKRebufferStartEvent and MUXSDKRebufferEndEvent

Fixes:
 Prevent overriding muxEmbed, muxEmbedVersion, and muxApiVersion from MUXSDKEnvironmentData
 Individual frameworks within the XCFramework are no longer separately code signed. The parent XCFramework is still signed.

v5.5.1

Improvements:
 Removes the deprecation on MUXSDKCustomerVideoData.videoCDN (added in v5.5.0)

v5.5.0

Improvements:
 Adds CDN change tracking, including automatically via X-CDN headers
 The MuxCore frameworks are now built as Mergeable Libraries. See this WWDC session and the official docs for more info. This is not enabled for the CocoaPods build.

Fixes:
 Fixes missing videoData in some instances, including after a rendition change
 Corrects a typo in viewPrerollAdAssetHostname causing it not to be sent
 Fixes an issue leading to incorrect viewPlayingTime and/or viewMaxPlayheadPosition
 Resolves a few naming issues that could cause builds to fail on case-sensitive filesystems

v5.4.1
Fixes:
 fix rebuffering ending while player is still buffering in some cases

v5.4.0
Improvements:
 Add customer viewer data to MUXSDKDataEvent and MUXSDKTrackableEvent
 Use consistent umbrella header path so import  works on all platforms

v5.3.1
Improvements:
 Add MUXSDKCustomerVideoData.videoCreatorId

v5.3.0
Improvements:
 adds additional dimensions

Fixes:
 adds missing macCatalyst platform to package spec

v5.2.0
Improvements:
 expose additional custom dimensions

v5.1.2
Fixes:
 dispatch queued up events when receiving adbreakend, aderror events
 patch memory leak when a player monitor is created and destroyed

v5.1.1
Fixes:
 Fully resets all player metrics associated with a previous view that had ended due to a time out when receiving a viewinit event.

v5.1.0
Improvements:
 Include codec and rendition name in renditionchange events
 Add safety checks when player identifier is nil

v5.0.1
Improvements:
 Include privacy manifest file

v5.0.0
Improvements:
 Error events can be categorized with warning or fatal severity levels
 Error events can be categorized as business exceptions
 An error translator can be configured to extend or customize the Core SDK error handling logic

Fixes:
 Player error details such as error code, error context, error message, error severity, and whether the error is a business exception are only sent to Mux when an error event is dispatched.
 Player error details (same as listed above) are no longer deduplicated and are explicitly included with each error event sent to Mux.
 The SDK continues to track watch time after an error event is dispatched based on player playhead progression. To explicitly indicate that watch time should no longer be tracked after an error during a playback session please dispatch a ViewEnd event.

v4.7.1
Improvements:
 Include privacy manifest file

v4.7.0
Improvements:
 Add support for monitoring media on visionOS. We recommend testing your visionOS SDK integration on both the simulator and a physical device prior to deploying to the App Store.

Fixes:
 Compute correct Video Startup Time if AdPlayingEvent occurs a significant time after the view has started
 Ensure seeks are excluded from Video Startup Time in all cases

Known Issues:
 Installation using Cocoapods on visionOS is not currently supported. Installation on iOS and tvOS using Cocoapods is not affected.

v4.6.0
API Changes:
 Expose player software name and player software version on MUXSDKPlayerData

Improvements:
 Bump beacon interval to 10 seconds to match the other Core SDKs

v4.5.2
Improvements:
 Backfill header nullability annotations

v4.5.1
Fixes:
 Include at playback time in the calculation for total playback time

v4.5.0
Updated:
 Add DRM Type to MUXSDKCustomerViewData so you can specify it from another source

Deprecated:
 MUXSDKDispatcher's handleBatch beaconCollectionDomain: osFamily: jsonDict: callback: has been deprecated in favor of an overload that takes headers for requests to the collection domain
 MUXSDKNetworkRequestBuilding buildRequestFromURL: eventsJsonDict: error: has been deprecated in favor of an overload that takes headers for requests to the collection domain

Improvements:
 Performance + Reliability improvements during large events

v4.4.2
Fixes:
 Fix ad metadata not being reported

v4.4.1
Improvements:
 Update beacon interval from 5s to 10s

v4.4.0
- Ad per-ad metadata for Ad events
- Fix strange views when a user seeks into an ad break

v4.3.0
- Add DRM Type and Error Context metadata fields

v4.2.0
- Add more Custom Dimensions

v4.1.1
- Fix Rendition::name misnamed

v4.1.0
- Add framerate, codec, and name to rendition properties

v4.0.0
- Due to Xcode 14, support for iOS and tvOS versions 9 and 10 have been removed. For more information see the last 'Deprecations' block in the release notes. This may result in a warning for client applications with deployment versions below iOS/tvOS 11

v3.14.0
- Split Views with >1 hour of inactivity into new views

v3.11.0

- Add inferred environment key support for users of Mux Data and Mux Video
- Expose MUXSDKEndedEvent in the public headers

v3.10.1

- Add weak self/strong self in closure block to avoid any retain cycles

v3.10.0

- Capture experiments values from HLS Session Data

v3.9.0

- Add Experiment Fields
- Log sent beacons in debug mode
- Set Xcode build setting APPLICATION_EXTENSION_API_ONLY = YES

v3.8.0

- Add internal device detection properties
- Add project binary specification file for Carthage support

v3.7.0

- Use synchronized to make query data objects thread safe.

v3.6.0

- Add transmission time and round trip time to beacon requests
- Add player_live_edge_program_time
- Add player_program_time

v3.5.0

- Allow overriding of viewer information (application name)
- Add nullability specifiers
- Custom beacon collection domains

v3.4.0

- Adds the MUXSDKCustomerData model
- Adds support for setting custom dimensions

v3.3.0

- Automatically build statically linked frameworks
- Remove dependency on UIKit

v3.2.0

- Add Swift PM support

v3.1.0

- Submits a new mux_embed field
- Fixes bugs with video start-up time for midroll or postroll ads
- Updates ad tracking to be more accurate
- Tracks view_playing_time

v3.0.3

- No functional changes, just generating a new release on CocoaPods

v3.0.2

- Include linker flags that enable the framework to be built without support for modules.
- Move instance variables out of headers

v3.0.0

This release moves the build process to use XCFramework bundle type. For iOS, there are no changes required to your application code.

If you are using this SDK with TVOS the name of the module has changed (the Tv suffix is no longer needed):

TVOS before 3.0:


```objc
@import MuxCoreTv;
```


TVOS after 3.0:


```objc
@import MuxCore;
```


v2.4.1

- (bugfix) Works around an issue where a view with no pre-roll ads, but with midroll and/or postroll ads will cause Mux to update the TTFF value erroneously

v3.0.0-beta.0

This release moves the build process to use XCFramework bundle type. For iOS, there are no changes required to your application code.

If you are using this SDK with TVOS the name of the module has changed (the Tv suffix is no longer needed):

TVOS before 3.0:


```objc
@import MuxCoreTv;
```


TVOS after 3.0:


```objc
@import MuxCore;
```


v2.4.0

 Adds support for player_remote_played and view_session_id.
 In addition to existing options that are provided via the MUXSDKCustomerPlayerData and MUXSDKCustomerVideoData objects, there is now support for MUXSDKCustomerViewData. The view_session_id may be set onMUXSDKCustomerViewData.

v2.3.0

- Update build process for Xcode 12 to exclude arm_64 architectures when building for simulator. Before Xcode 12, xcodebuild never built arm_64 slices for the simulator. Now, it does (in preparation for Apple silicon). Because arm_64 slices now get built for the simulator, lipo errors out, because it can't have the same architecture for two different platforms (it already has arm_64 for the device platform). This is a temporary work around until a later major version release which will use the new XCFramework hotness
- bump iOS deploy target to '9.0' in podspec and project build settings for Xcode 12 compatibility

v2.2.0

- bugfix: Removes erroneously committed logs from the compiled frameworks

v2.2.1

- bugfix - ignore scaling calculations when player or source width or height dimension is 0

v2.2.0

 Add support for renditionchange events
 Add support for orientationchange events

v2.1.3

- bugfix for request metrics calculation. If we don't have responseStart, fallback to requestStart in order to calculate throughput

v2.1.2

- bugfix - Use monotonically increasing time in Objc client library. Avoids a bug if system time changes during a view.

v2.1.1

- Expose videoSourceUrl on MUXSDKCustomerVideoData. This allows a user to set the videoSourceUrl (along with their other VideoData, in which case any videoSourceUrl that is inferred from the player will be ignored.

v2.1.0

- Fix build process for Xcode 11
- Make player_instance_id a full uuid-style string
- Make sure to always send player_instance_id
- Bump Mux API versions for new collectors/processors
