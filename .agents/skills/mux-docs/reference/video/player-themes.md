# Choose a theme for Mux Player

**Source:** https://mux.com/docs/_guides/developer/player-themes

Mux Player is built on top of Media Chrome
that comes with simple but powerful theming
capabilities. It allows you to fully control the video player UI layout
and style but keeps the complexity of media state management out of the way.

Themes are unavailable if you are using the Mux Player HTML embed through player.mux.com.

Mux themes

The minimal and microvideo themes require one extra import,
then set the theme attribute and you're ready to go!

Minimal theme

This theme pares down the Mux Player experience to the bare bones controls
viewers need, ideal for those that want a simpler player experience.

Here's an example of a React app using the Minimal theme.

Microvideo theme

This theme optimizes for shorter content that doesn't need the robust playback
controls that longer content typically requires.

Here's an example of a HTML page using the Microvideo theme.

Classic theme

This theme is the classic 1.x version of Mux Player. Here's an example of a HTML page using the Classic theme.

Styling

You can use the same styling methods like explained in
customize look and feel.

Note that the CSS variables, CSS parts and styling guidelines are relevant to themes that ship from @mux/mux-player/themes. Any other Media Chrome themes created by you or a third party will not necessarily share the same CSS variables and parts.

Unlike the Mux Player default theme, these themes come with some buttons disabled by default.
However these can still be enabled by setting some CSS vars.

| Button | CSS Variable |
| --- | --- |
| Seek backward button | --seek-backward-button: block; |
| Seek forward button | --seek-forward-button: block; |
| PiP (Picture-in-Picture) button | --pip-button: block |

Media Chrome themes

Mux Player uses Media Chrome themes to layout and style the UI of
the video player. Please read the
themes documentation
to learn how to create a theme.

There are two ways to consume a Media Chrome theme in Mux player.

Via an inline `

See the example on Codesandbox

Via a custom element `

See the example on Codesandbox
