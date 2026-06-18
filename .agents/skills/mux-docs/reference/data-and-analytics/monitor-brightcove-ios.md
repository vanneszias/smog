# Monitor Brightcove (iOS)

**Source:** https://mux.com/docs/_guides/developer/monitor-brightcove-ios

Brightcove's native SDK for iOS is based on AVPlayerLayer. You will need to be using Brightcove's iOS player version 6.x.


```
pod 'Mux-Stats-AVPlayer', '~>3.0'
```


This will install Mux-Stats-AVPlayer and the latest current release of our core Objective-C Library. There will be no breaking updates in major versions, so you can safely run pod update for future versions.

Next, add correct import statement into your application.

In your application, you will need to hook into Brightcove's SDK lifecycle events in order to access the underlying AVPlayerLayer instance.


```objc
@import BrightcovePlayerSDK;
@import MUXSDKStats;

@property (nonatomic, copy) NSString *trackedPlayerName;

- (void)playbackController:(id<BCOVPlaybackController>)controller didAdvanceToPlaybackSession:(id<BCOVPlaybackSession>)session
{
    // Destroy previous MUXSDKStats if this signifies the other view ended
    // Note: you may want to handle this in another lifecycle event, if you
    // have one that signifies when the video playback has ended/exited.
    if (self.trackedPlayerName != nil) {
        [MUXSDKStats destroyPlayer:self.trackedPlayerName];
    }

    MUXSDKCustomerPlayerData *playerData = [[MUXSDKCustomerPlayerData alloc] initWithEnvironmentKey:@"ENV_KEY"];
    [playerData setPlayerName: @"Brightcove SDK w/ Mux"];
    // set additional player metadata here
    MUXSDKCustomerVideoData *videoData = [MUXSDKCustomerVideoData new];
    [videoData setVideoId:@"EXAMPLE ID"];
    // set additional video metadata here
    self.trackedPlayerName = @"example_player_name";
    [MUXSDKStats monitorAVPlayerLayer:session.playerLayer withPlayerName:self.trackedPlayerName playerData:playerData videoData:videoData];
}
```


Refer to the detailed guide for AVPlayer to finish setup.

  <GuideCard
    title="Detailed AVPlayer guide"
    description="After getting a reference to your AVPlayerLayer instance, finish configuring it."
    links={[
      {title: "Read the guide", href: "/docs/guides/monitor-avplayer"},
    ]}
  />
