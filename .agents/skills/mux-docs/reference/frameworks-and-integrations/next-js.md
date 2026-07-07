# Add high-performance video to your Next.js application

**Source:** https://mux.com/docs/_guides/frameworks/next-js

Mux is available as a native integration through the Vercel Marketplace. Visit the Vercel documentation for specific guidance related to getting up and running with Mux on Vercel.

When should you use Mux with Next.js?
When adding video to your Next.js app, you'll encounter some common hurdles. First, videos are large. Storing them in your public directory can lead to excessive bandwidth consumption and poor Git repository performance. Next, it's important to compress and optimize your videos for the web. Then, as network conditions change, you might want to adapt the quality of your video to ensure a smooth playback experience for your users. Finally, you may want to integrate additional features like captions, thumbnails, and analytics.

You might consider using Mux's APIs and components to handle these challenges, and more.

Quickly drop in a video with next-video

next-video is a React component, maintained by Mux, for adding video to your Next.js application. It extends both the ` element and your Next app with features to simplify video uploading, storage, and playback.

To get started...
1. Run the install script: npx -y next-video init. This will install the next-video package, update your next.config.js and TypeScript configuration, and create a /videos folder in your project.
2. Add a video to your /videos folder. Mux will upload, store, and optimize it for you.
3. Add the component to your app:

```jsx
import Video from 'next-video';
import myVideo from '/videos/my-video.mp4';

export default function Page() {
 return <Video src={myVideo} />;
}
```


Check out the next-video docs to learn more.

Use the API and our components for full control

If you're looking to build your own video workflow that enables uploading, playback, and more in your application, you can use the Mux API and components like Mux Player and Mux Uploader.

Example: allowing users to upload video to your app
One reason you might want to build your own video workflow is when you want to allow users to upload video to your app.

Let's start by adding a new page where users can upload videos. This will involve using the Mux Uploader component, which will upload videos to a Mux Direct Uploads URL.

In the code sample below, we'll create an upload URL using the Mux Node SDK and the Direct Uploads URL API. We'll pass that URL to the Mux Uploader component, which will handle uploading for us.

In production, you'll want to apply additional security measures to your upload URL. Consider protecting the route with authentication to prevent unauthorized users from uploading videos. Also, use cors_origin and consider playback_policy to further restrict where uploads can be performed and who can view uploaded videos.

Next, we'll create an API endpoint that will listen for Mux webhooks. When we receive the notification that the video has finished uploading and is ready for playback, we'll add the video's metadata to our database.

Finally, let's make a playback page. We retrieve the video metadata from our database, and play it by passing its playbackId` to Mux Player:

And we've got upload and playback. Nice!

What's next? You can integrate with your CMS. You can optimize your loading experience. Or get started with an example project below:

Example projects

  <GuideCard
    title="Video Course Starter Kit"
    description={If you’re a developer you’ve probably seen and used platforms like Egghead, LevelUp Tutorials, Coursera, etc. This is your starter kit to build something like that with Next.js + Mux. Complete with Github OAuth, the ability to create courses, adding video lessons, progress tracking for viewers.}
    links={[
      {
        title: "View project →",
        href: "https://github.com/muxinc/video-course-starter-kit",
      },
    ]}
  />
  <GuideCard
    title="with-mux-video"
    description={<>
      This is a bare-bones starter application with Next.js that uses:

        Mux Direct Uploads
        Mux Video + Mux Data
        Mux Player

    }
    links={[
      {
        title: "View project →",
        href: "https://github.com/vercel/next.js/tree/931eee87be8af86bd95336deade5870ad5e04669/examples/with-mux-video",
      },
    ]}
  />
  <GuideCard
    title="stream.new"
    description={<>
      Stream.new is an open source Next.js application that does:

        Mux Direct Uploads
        Content Moderation with Google Vision or Hive.ai (Read more)

    }
    links={[
      {
        title: "View project →",
        href: "https://github.com/muxinc/stream.new",
      },
    ]}
  />
