# _guides/snippets/sdk-web-error-translator-2

**Source:** https://mux.com/docs/_guides/snippets/sdk-web-error-translator-2

If you return false from your errorTranslator function then the error will not be tracked. Do this for non-fatal errors that you want to ignore. If your errorTranslator function itself raises an error, then it will be silenced and the player's original error will be used.
