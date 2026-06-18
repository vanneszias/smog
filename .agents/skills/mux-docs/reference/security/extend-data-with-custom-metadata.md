# Extend Data with custom metadata

**Source:** https://mux.com/docs/_guides/developer/extend-data-with-custom-metadata

Limits

The number of custom dimensions you can track depends on your plan. See the pricing page for details.

There are many metadata dimensions that can be used to track information about video views such as Video Title, Video Series, or Encoding Variant. You can find the whole list on the guide to making your data actionable. Custom Dimensions allow you to define, submit, and report on metadata necessary to support your use case that are not in the pre-defined collection of metadata dimensions in Mux Data. Examples could include metadata such as the device firmware version or a subscription plan type.

Each custom dimension can have a display name and an assigned category. They also have a pre-defined field name, such as custom_1, that is used to refer to the dimension in code when submitting a value to track as part of a view. You'll use these field names when sending these values via an SDK integration or accessing a dimension value using the Mux Data API.

The Custom Dimensions configuration is available from the Settings page and selecting the "Custom Dimensions" tab. You will see the list of the dimensions that are available for reporting.

To enable a dimension, click the switch next to the left of the dimension name. To disable a dimension, simply click the switch off. The custom dimension data will continue to be collected from the SDKs but it will not be available to users for reporting in the Mux Dashboard.

To edit a dimension, click the edit pencil to the right of the row. You can set the display name of the dimension to match your preferred definition and assign the most appropriate category. By default, Custom Dimensions are included in the Custom category but they can added to any existing dimension category.

The name and category of the dimension are used wherever dimensions are displayed, such as the Metrics Breakdown page, the View detail page, the Filter model, or the dimensions list on the Compare page.

Once configured to be visible, Custom Dimensions are available to report on in the same method as pre-defined dimensions. The dimensions are available for filtering, aggregation, and comparison from the Metrics Breakdown screen in the category that was assigned for each visible dimension.

The Custom Dimension values are also available in the export files using the pre-defined field name (i.e. custom_1).

Custom Dimension data is configured in the Mux Data SDKs in a similar method to other view metadata.

Metadata is submitted to the SDKs using the pre-defined field name assigned to the dimension you have configured. For example, if you configured the custom_1 dimension to have the display name "Secondary User Id," you submit that secondary user id value using the custom_1 or CustomData1 metadata field, depending on the platform.

Make sure you are using an up-to-date version of each Mux Data SDK to enable support for submitting Custom Dimensions.

HTML5 Video Element and other web SDKs

In web-based SDKs, Custom Dimensions are set in the same data object as the other view metadata fields.


```js
mux.monitor('#test_video', {
  data: {
    // Set other view data
    video_title: 'Big Buck Bunny',
    player_init_time: playerInitTime,
    env_key: 'YOUR_ENVIRONMENT_KEY_HERE',

    // Set custom dimension data
    custom_1: 'My Custom Dimension Value'    // Set the custom value here
  }
});
```


For more guidance on using and configuring web-based SDKs, please refer to the guide on monitoring the HTML5 video element.

Version 4.1.0 or later of the HTML5 Video Element monitor is necessary to support Custom Dimensions.

ExoPlayer

In Android-based SDKs, Custom Dimensions are set in the CustomData object and attached to the CustomerData object that is used to initialize the Mux Data SDK.


```java
// Set other view data
CustomerPlayerData customerPlayerData = new CustomerPlayerData();
customerPlayerData.setEnvironmentKey("YOUR_ENVIRONMENT_KEY_HERE");
CustomerVideoData customerVideoData = new CustomerVideoData();
customerVideoData.setVideoTitle("Big Buck Bunny");

// Set custom dimension data
CustomData customData = new CustomData();
customData.setCustomData1("MY_CUSTOM_DIMENSION_VALUE");  // Set the custom value here
CustomerData customerData = new CustomerData(customerPlayerData, customerVideoData, null);
customerData.setCustomData(customData);

muxStats = new MuxStatsExoPlayer(this, player, "demo-player", customerData);
```


An example integration that includes Custom Dimensions can be found in the demo application for muxinc/mux-stats-sdk-exoplayer which integrates Mux into an ExoPlayer demo application.

For more guidance on using and configuring Android SDKs, please refer to the guide on monitoring ExoPlayer.

Version 2.5.0 or later of the ExoPlayer monitor is necessary to support Custom Dimensions.

AVPlayer

In iOS-based SDKs, Custom Dimensions are set in the MUXSDKCustomData object and attached to the MUXSDKCustomerData object that is used to initialize the Mux Data SDK.


```swift
// Set custom dimension data
MUXSDKCustomData *customData = [[MUXSDKCustomData alloc] init];
[customData setCustomData1:@"my-custom-dimension-value"];  // Set the custom value here

// Set other view data
MUXSDKCustomerPlayerData *playerData = [[MUXSDKCustomerPlayerData alloc] initWithPropertyKey:@"YOUR_ENVIRONMENT_KEY_HERE"];
MUXSDKCustomerVideoData *videoData = [MUXSDKCustomerVideoData new];
videoData.videoTitle = @"Big Buck Bunny";
MUXSDKCustomerViewData *viewData= [[MUXSDKCustomerViewData alloc] init];

MUXSDKCustomerData *customerData = [[MUXSDKCustomerData alloc] initWithCustomerPlayerData:playerData videoData:videoData viewData:viewData customData: customData];
_playerBinding = [MUXSDKStats monitorAVPlayerViewController:_avplayerController withPlayerName:@"demo-player" customerData:customerData];
```


An example integration that includes Custom Dimensions can be found in the demo application for muxinc/mux-stats-sdk-avplayer which integrates Mux into a AVPlayer demo application.

For more guidance on using and configuring iOS SDKs, please refer to the guide on monitoring AVPlayer.

Version 2.5.0 or later of the AVPlayer monitor is necessary to support Custom Dimensions.

Roku

In the Roku SDK, Custom Dimensions are set in the same muxConfig object as the other view metadata fields.


```js
m.mux = m.top.CreateNode("mux")
m.mux.setField("video", m.video)

muxConfig = {
  property_key: "YOUR_ENVIRONMENT_KEY_HERE",
  ' Set the custom dimension data
  custom_1: "my-custom-dimension-value"
}

m.mux.setField("config", muxConfig)
m.mux.control = "RUN"

' Load the video into the Video node
```


For more guidance on using and configuring the Roku SDK, please refer to the guide on monitoring Roku.

Version 1.1.0 or later of the Roku monitor is necessary to support Custom Dimensions.
