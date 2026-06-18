# Migrate to LiveKit Web SDK

**Source:** https://mux.com/docs/_guides/developer/spaces-to-livekit

LiveKit provides real-time video services, including both an open-source stack and a cloud-hosted option,
and will provide a simple integration with Mux to produce a Live Stream broadcast of any real-time video interactions.

When migrating from Mux Spaces to LiveKit you'll find most of the concepts are the same but there are a few terminology
changes. We recommend using one of LiveKit's Server SDKs to manage
any communication with LiveKit's API.

Spaces

The LiveKit equivalent of a Space is called a Room. Rooms can be created manually
or will be auto-created when the first participant joins. With LiveKit you must provide a unique
name for the room.

One notable difference between Spaces and Rooms is the behavior of the auto subscription functionality.
Spaces' automatic subscription mode works by subscribing to a maximum of 20 participants which have the highest priority server-side.
LiveKit's behavior around automatic subscription will subscribe participants to every other participant.

Broadcasts

The LiveKit equivalent of a Broadcast is called a Composite Recording.

LiveKit will provide a native integration with Mux to produce a Live Stream broadcast of any real-time video interactions.
In the mean time you can also use Composite Recording to send an RTMP stream to Mux as a Live Stream.

Broadcast Layouts

LiveKit has their own built-in layouts for Composite Recordings but Mux is also open-sourcing
the layouts we used for Broadcasts so you can use them within LiveKit.
See the GitHub page muxinc/spaces-livekit-broadcast-layouts
for more details

JWTs are fundamental to using both Mux’s Real-Time Video & LiveKit but there are some major differences in their claim structure.
See the LiveKit documentation for more details.

JWT Claims

| Claim | Mux | LiveKit |
|-------|-----|---------|
| exp | Expiration time of the token | No changes |
| iss | N/A | API key ID used to issue this token |
| kid | API Key ID used to sign this token | N/A |
| sub | Space ID | Unique identity of the participant |
| aud | "rt" | N/A |
| participant_id | Unique identity of the participant | N/A |
| role | publisher or subscriber | N/A |
| metadata | N/A | Participant metadata |
| video.room | N/A | name of room the participant will join |
| video.roomJoin | N/A | true if the participant is allowed to join the room |
| video.canPublish | N/A | true if the participant is allowed to publish media to the room |
| video.canSubscribe | N/A | true if the participant is allowed to subscribe to media in the room |
| video.canPublishData | N/A | true if the participant is allowed to publish data (Equivalent to Mux's custom events) to the room |
| video.canUpdateOwnMetadata | N/A | true if the participant is allowed to update their own metadata (required for participant to set their own display name) |

Example of a Publisher JWT

<CodeExamples
  examples={{
    Mux: {
	"exp": 1750137631,
	"kid": "{ KEY ID HERE }",
	"sub": "{ SPACE ID HERE }",
	"aud": "rt",
	"participant_id": "bob",
	"role": "publisher"
}
    ,
    LiveKit: {
	"exp": 1750137631,
	"iss": "{ KEY ID HERE }",
	"sub": "bob",
	"metadata": "details about bob",
	"video": {
		"room": "{ ROOM ID HERE }",
		"roomJoin": true,
		"canPublish": true,
		"canSubscribe": true,
		"canUpdateOwnMetadata": true,
		"canPublishData": true
	}
}
    ,
  }}
  exampleOrder="Mux,LiveKit"
  args={{ Mux: { lang: 'text' }, LiveKit: { lang: 'text' }}}
/>

In order to make the transition to LiveKit easier we have created an adapter that will allow you
continue using the Mux Spaces Web SDK while using LiveKit under the hood.

  The adapter is not a long term solution and we recommend that you migrate to the LiveKit Web SDK as soon as possible.

Install the adapter

Update your package.json file to pull in the adapter using @mux/spaces-web as an alias
so that you can continue to use the same import statements followed by an npm install.


```json
"@mux/spaces-web": "npm:@mux/spaces-livekit-adapter@^0.1.9",
```


The only client side change you'll need to make is to update the Space constructor
to tell it which LiveKit instance to use.


```js
new Space(/* Your LiveKit JWT */, /* Your LiveKit URL */);
```


At this point your application should be using LiveKit under the hood & you can stop here.
Continue reading when you want to migrate to the LiveKit Web SDK directly.


```bash
yarn add livekit-client
```


Replace instances in your imports of @mux/spaces-web with livekit-client,
some of the types will not be found but we'll fix them in the following steps.

We'll begin the code migration by finding where the Space is first initialized &
replace it with the equivalent new Room call. Before proceeding you'll need your updated JWT
& your LiveKit URL. If you're using LiveKit Cloud you'll be provided one upon signing up,
otherwise it'll be the URL where you're hosting LiveKit.

The call flow is roughly the same but with new Room() instead of new Space()
and .connect() instead of .join(). Some parameters are also shifted from the Space
constructor to the room connect method.

<CodeExamples
  examples={{
    Mux: const space: Space = new Space(/ jwt: string /, / options?: SpaceOptionsParams /);
const localParticipant = await space.join();
    ,
    LiveKit: const room: Room = new Room(/ options?: RoomOptions /);
await room.connect(/ url /, / token /, / opts? /);
const localParticipant = room.localParticipant;
    ,
  }}
  exampleOrder="Mux,LiveKit"
  args={{ Mux: { lang: 'text' }, LiveKit: { lang: 'text' }}}
/>

When calling join() using the Mux Spaces SDK any participants already in the room will
trigger a ParticipantJoined event on the space object, but with LiveKit's SDK the existing
participants will not trigger ParticipantConnected events.
Instead of listening to an event you will need to trigger any handling of the existing
participants by retrieving the list from room.participants.

There are only minor differences between Mux's participant objects and LiveKit's.

| Mux | LiveKit |
|-----|---------|
| connectionId | sid (Server ID) |
| id | identity |
| displayName | name |
| role | permisions |
| status | N/A |

Tracks are one of the areas where there's a conceptual difference between Mux Spaces & LiveKit.
Mux has a single RemoteTrack class which may or may not be currently subscribed.
LiveKit separates out the concept of the tracks that a participant is publishing from the
tracks to which a LocalParticipant is subscribed. RemoteTrackPublication is object received
when a RemoteParticipant publishes a track.
A LiveKit RemoteTrack is the object available when the local participant is subscribed to
that publication. The parameters for events around tracks can contain both a RemoteTrack &
a RemoteTrackPublication, depending on what you're code depends on you may need one or both
of these objects.

SpaceEvent to RoomEvent

| Mux | LiveKit |
|-----|---------|
| ActiveSpeakersChanged | ActiveSpeakersChanged |
| LocalParticipantReconnectFailed | N/A |
| LocalParticipantReconnecting | N/A |
| ParticipantDisplayNameChanged | ParticipantNameChanged |
| ParticipantLeft | ParticipantDisconnected |
| ParticipantTrackPublished | TrackPublished |
| ParticipantTrackUnmuted | TrackMuted |
| ParticipantTrackUnsubscribed | TrackUnsubscribed |
| BroadcastStateChanged | RecordingStatusChanged |
| LocalParticipantReconnected | Reconnected |
| ParticipantCustomEventPublished | DataReceived |
| ParticipantJoined | ParticipantConnected |
| ParticipantTrackMuted | TrackMuted |
| ParticipantTrackSubscribed | TrackSubscribed |
| ParticipantTrackUnpublished | TrackUnpublished |

ParticipantEvent

| Mux | LiveKit |
|-----|---------|
| CustomEventPublished | DataReceived |
| StartedSpeaking | IsSpeakingChanged(speaking: true) |
| TrackMuted | TrackMuted |
| TrackSubscribed | TrackSubscribed |
| TrackUnpublished | TrackUnpublished |
| DisplayNameChanged | ParticipantNameChanged |
| StoppedSpeaking | IsSpeakingChanged(speaking: false) |
| TrackPublished | TrackPublished |
| TrackUnmuted | TrackUnmuted |
| TrackUnsubscribed | TrackUnsubscribed |

| Kind | Mux | LiveKit |
|------|-----|---------|
| Function | getUserMedia | createLocalTracks |
| Function | getDisplayMedia | createLocalScreenTracks |
| Function | getLocalTracksFromMediaStream | new LocalVideoTrack or new LocalAudioTrack |
| Enum | AcrScore | LiveKit does not have the concept of reporting user provided ACR scores. |
| Enum | ParticipantRole | LiveKit does not have roles, instead it has granular permissions: ParticipantPermission |
| Enum | SpaceEvent | RoomEvent |
| Enum | TrackEvent | TrackEvent |
| Enum | TrackSource | Track.Source |
| Enum | ParticipantEvent | ParticipantEvent |
| Enum | ParticipantStatus | N/A. Use the ParticipantEvents to determine status |
| Enum | SubscriptionMode | RoomConnectOptions.autoSubscribe |
| Enum | TrackKind | Track.Kind |
| Interface | CreateLocalMediaOptions | CreateLocalTrackOptions |
| Interface | SpaceOptionsParams | RoomOptions |
| Interface | LocalTrackOptions | AudioCaptureOptions or VideoCaptureOptions |
| Class | LocalParticipant | LocalParticipant |
| Class | RemoteTrack | RemoteTrack & RemoteTrackPublication |
| Class | Track | Track |
| Class | LocalTrack | LocalTrack & LocalTrackPublication |
| Class | RemoteParticipant | RemoteParticipant |
| Class | Space | Room |
| Type Alias | ActiveSpeaker | N/A. LiveKit only identifies the participant in active speaker events not the track |
| Type Alias | CustomEvent | Data messages |
