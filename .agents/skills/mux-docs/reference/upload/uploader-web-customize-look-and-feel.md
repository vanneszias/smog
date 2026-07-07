# Customize the look and feel of Mux Uploader

**Source:** https://mux.com/docs/_guides/developer/uploader-web-customize-look-and-feel

Configure UI features

The basic use case of Mux Uploader includes many UI features which may be enabled or disabled by default.
You can toggle many of these via attributes/properties.

Enable pausing

For larger video files, you may want to allow your users to pause and resume an upload. You can enable this in the UI using
the pausable attribute, property, or React prop.

Because Mux Uploader uploads the file in chunks, it will wait to complete uploading the current chunk before pausing. To indicate this,
the pause button will actually have 3 states:

1. Pause - indicates the upload is not currently paused, but can be by pressing the button.
2. Pausing - indicates that the upload will pause once the current chunk upload finishes. The button will be disabled in this case.
3. Resume - indicates the upload is currently paused, but can be resumed by pressing the button.

Below are examples of what this looks like in the UI.

<MultiImage
  images={[
    { src: "/docs/images/mux-uploader-web-pause.png", width: 710, height: 173 },
    { src: "/docs/images/mux-uploader-web-pausing.png", width: 710, height: 173 },
    { src: "/docs/images/mux-uploader-web-resume.png", width: 710, height: 173 },
  ]}
/>

Disable Retrying

If for some reason your video upload fails, Mux Uploader will allow a user to retry via the UI. You can disable this using the
no-retry attribute or noRetry property in the web component, or just noRetry prop in React.

Below are examples of what this looks like in the UI.

<MultiImage
  images={[
    { src: "/docs/images/mux-uploader-web-retry.png", width: 710, height: 160 },
    { src: "/docs/images/mux-uploader-web-no-retry.png", width: 710, height: 141 },
  ]}
/>

Disable Drag & Drop

Mux Uploader makes drag and drop available for your video files by default. You can disable this using the
no-drop attribute or noDrop property in the web component, or just noDrop prop in React.

Below are examples of what this looks like in the UI.

<MultiImage
  images={[
    { src: "/docs/images/mux-uploader-web-drop.png", width: 502, height: 210 },
    { src: "/docs/images/mux-uploader-web-no-drop.png", width: 710, height: 50 },
  ]}
/>

Note: There are two likely cases where you may want to disable drag and drop on Mux Uploader:

1. You still want to support drag and drop, but your page or application design needs the drop zone component somewhere different.
Mux Uploader supports this by allowing you to use its subcomponents directly.
2. You want to use Mux Uploader with all of its features baked in but drag and drop doesn't make sense for your designs. Because
things like the upload progress UI requires more space for its display, you'll probably also want to
use CSS to customize Mux Uploader.

Disable other UI subcomponents or features

Mux Uploader also provides attributes and properties to disable:

- The upload progress UI (no-progress / noProgress for the web component attribute / property, noProgress for the React prop)
- The upload status UI (e.g. when the upload is complete or when an error occurs) (no-status / noStatus for the web component attribute / property, noStatus for the React prop)

Since removing these UI elements might result in a poor user experience, you may want to use Mux Uploader's subcomponents directly for a more bespoke design when doing so.

Override the file selector with slots

Because Mux Uploader is a web component, it lets you provide your
own file select element simply by adding it as a child and using the named slot
slot="file-select" attribute or property.

This is really handy if, for example, you already have a .btn class or similar that styles buttons in your application. For example:

The same applies to the React version of the component, `, as it's just a wrapper around the web component:

Style with CSS

The Mux Uploader element, , can be styled and positioned with CSS just like you would any other HTML element. For example:

Because Mux Uploader React is a wrapper around the HTML element, the same applies to it as well:

- Mux Uploader relies on certain styles for its layout, so take care when overriding them. For example: flexbox is used by default to layout
its subcomponents so it might be best to prefer display: inline-flex instead of potentially changing it to inline or inline-block.
- Because Mux Uploader is a complex component made up of various sub-components, your mileage may vary on simply relying
on CSS to style the component. In these more advanced cases of styling, you may want to explore using CSS variables or
using the Mux Uploader subcomponents directly.

Use CSS variables for additional styling

In addition to styling with standard CSS, Mux Uploader exposes some additional styles via CSS variables.
This allows you to tweak some of the "under the hood" subcomponents' styles simply. These include:

| Name                            | CSS Property       | Default Value               | Description                                     |
| ------------------------------- | ------------------ | --------------------------- | ----------------------------------------------- |
| --overlay-background-color    | background-color | rgba(226, 253, 255, 0.95) | background color of the drop overlay            |
| --progress-bar-fill-color     | background       | 000000                   | color for progress bar                          |
| --progress-percentage-display | display          | block                     | display value for text percentage progress UI   |
| --progress-radial-fill-color  | stroke           | black                     | stroke color for radial progress (experimental) |

Building off of the prior examples, you can use these just like you would other CSS variables:

And for React:

Use uploader attributes for state-driven styling

Mux Uploader uses read-only properties and attributes to manage and advertise different state changes during the upload process.

These are:

| State | Description |
| --- | --- |
| (none) | Upload has not yet begun |
| upload-in-progress | Upload is currently in progress. NOTE: This includes while the upload is paused. |
| upload-complete | Upload has completed. |
| upload-error` | An error occurred while attempting to upload. |

These allow you to use attribute selectors
if you want state-driven, dynamic styling via CSS.

Here's a basic example of these in action that builds off of the prior examples:

NOTE: Because Mux Uploader React is a thin wrapper around the Mux Uploader web component, you can use these exact same CSS selectors
in your React application. Alternatively, some frameworks, like Tailwind CSS, have built-in support for arbitrary
attribute selectors. For an example of this in use, see the section below.

Styling in React

If you're using React to build your application, there are some common patterns used in React that are less likely to be relevant for
the web component version. Below are a couple of these.

Using CSS modules

One common pattern for styling in React is to use CSS-in-JS, for example, using CSS modules:

Using Tailwind CSS

Another common approach to styling React applications is using Tailwind CSS. Here's an example for Mux Uploader
approximating the previous examples, including CSS variables via
arbitrary properties and attribute selectors via
arbitrary variants:
