import { useCallback, useState } from "react";
import { useDelayRender, useRemotionEnvironment } from "remotion";

/**
 * How the composition fails (task 3 review, M-2 and M-7). The handler
 * fails with `new Error(message, { cause })`: a fixed message, since the
 * media errors Remotion hands over name their `src` (a signed URL must
 * never reach a log). While rendering, `cancelRender` ends the render with
 * it (it throws after storing the error, which is how the renderer reads
 * it; an async callback swallows the throw). In the Player the error is
 * thrown during the next render instead, so the Player's `errorFallback`
 * shows it. A silent `cancelRender` would leave an empty frame and an
 * unhandled rejection. The handler is stable, so it can be a media
 * `onError` prop as is.
 */
export function useFailure(message: string): (cause?: unknown) => void {
  const { isRendering } = useRemotionEnvironment();
  const { cancelRender } = useDelayRender();
  const [failure, setFailure] = useState<Error | null>(null);
  const fail = useCallback(
    (cause?: unknown) => {
      const error = new Error(message, { cause });
      if (!isRendering) {
        setFailure(error);
        return;
      }
      try {
        cancelRender(error);
      } catch {
        // `cancelRender` throws after storing the error for the renderer.
      }
    },
    [cancelRender, isRendering, message]
  );
  if (failure) {
    throw failure;
  }
  return fail;
}
