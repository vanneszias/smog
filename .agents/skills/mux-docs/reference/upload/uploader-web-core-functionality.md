# Core functionality of Mux Uploader

**Source:** https://mux.com/docs/_guides/developer/uploader-web-core-functionality

Mux Video integration

Mux Uploader is built for working with Mux's Direct Uploads API and workflow. Add your upload
URL as Mux Uploader's endpoint to use it.

Mux Uploader uses UpChunk under the hood to handle large files by splitting them into small chunks before uploading them.

Controls and UI

Mux Uploader provides a feature-rich, dynamic UI that changes based on the current state of your media upload.
These can be broken down into:

| State | Attribute | Description |
| ----- | --------- | ----------- |
| Initial | (none) | State before a media file has been selected for upload |
| In Progress | upload-in-progress | State while media chunks are being uploaded |
| Completed | upload-complete | State after the media has successfully finished uploading all chunks |
| Error | upload-error | State whenever an error occurs that results in a failure to fully upload the media |

Initial State

The initial state by default will show both a drag and drop region and a file select button to select your file for upload.
By default, it looks like this:

In Progress State

Under normal conditions, the in progress state will indicate the ongoing uploading progress as both a numeric percentage and
a progress bar. It will look something like this:

Pausing

In addition, you can opt into pausing, in which case the UI
will look like one of these, depending on if you are unpaused, pausing (after the current chunk finishes uploading), or paused.

<MultiImage
  images={[
    { src: "/docs/images/mux-uploader-web-pause.png", width: 710, height: 173 },
    { src: "/docs/images/mux-uploader-web-pausing.png", width: 710, height: 173 },
    { src: "/docs/images/mux-uploader-web-resume.png", width: 710, height: 173 },
  ]}
/>

Offline

Finally, if you unfortunately end up loosing internet connection while uploading is in progress, you'll see this:

Completed State

Once uploading has completed, Mux Uploader will present the following status:

Error State

And in the unfortunate case where you encounter an error, by default you'll see the error message and a retry button:

If you want to explore different ways to customize the UI for these different states,
check out our documentation on customizing Mux Uploader's look and feel.

Error handling

Mux Uploader will monitor for unrecoverable errors and surface them via the UI, giving the
user the opportunity to retry the upload. Mux Uploader monitors both HTTP-status based errors
(e.g. 4xx, 5xx statuses) and file processing errors like exceeding maximum file size limits. See our optional configuration options below for more ways to work around some of these errors.

In addition, before surfacing an HTTP-based error, Mux Uploader will automatically retry the request 5 times.

You may also listen for these errors via the uploaderror event, discussed in the section below.

Using events

All of Mux Uploader's core UI behaviors and functionality are driven by specific events. These fall into two
categories:

1. user-driven update events (e.g. notifying Mux Uploader which file to upload or to retry uploading after an error)
2. state-driven informational events (e.g. notifying subcomponents or anyone else listening about the upload progress or that an error occurred)

For example, you can listen for the progress event to receive details on how far along your file upload is.


```js
  const muxUploader = document.querySelector('mux-uploader');

  muxUploader.addEventListener('progress', function (e) {
    console.log(`My upload is ${e.detail}% complete!`)
  });
```


When the upload is complete, you'll see 100% on the progress bar and the success event will fire.

If an error occurs during the upload, an uploaderror event will fire.

Example HTML Usage


```html
<mux-uploader endpoint="https://my-authenticated-url/storage?your-url-params"></mux-uploader>

<script>
  const muxUploader = document.querySelector('mux-uploader');

  muxUploader.addEventListener('success', function () {
    // Handle upload success
  });

  muxUploader.addEventListener('uploaderror', function () {
    // Handle upload error
  });
</script>
```


Example React Usage


```jsx
import MuxUploader from "@mux/mux-uploader-react";

export default function App() {
  return (
    <MuxUploader
      endpoint="https://my-authenticated-url/storage?your-url-params"
      onSuccess={() => {
        // Handle upload success
      }}
      onUploadError={() => {
        // Handle upload error
      }}
    />
  );
}
```


Configure Upload Details

In addition to various UI customization and behaviors, Mux Uploader exposes the following attributes / properties for configuring details
about the file upload itself:

| Attribute / Property | Description |
| --- | --- |
| max-file-size / maxFileSize | The largest size, in kB, allowed for upload |
| chunk-size / chunkSize | The size of each upload chunk, in kB. Useful for advanced optimization based on known network conditions or file details. |
| dynamic-chunk-size / dynamicChunkSize | A boolean that tells Mux Uploader to automatically adapt its chunk size larger or smaller based on network conditions. |
| use-large-file-workaround / useLargeFileWorkaround | A boolean that enables a less memory efficient way of loading and chunking files for environments that don't reliably handle ReadableStream for large files. This can occur on e.g. Safari browsers with files >= 4GB. NOTE: This fallback will only be used if and when attempts to use ReadableStream fails. |

Full API reference

Any features or settings not mentioned above can be found in our full API reference
covering all of the available events, attributes, properties, slots, CSS parts, and CSS variables available on Mux Uploader and all of its subcomponents.
