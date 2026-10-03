import { useEffect, useState } from "react";

/**
 * An object URL for a local file (the logo preview, ruling 10: the CSP
 * `img-src` has `blob:`), revoked when the file changes or on unmount.
 */
export function useObjectUrl(file: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}
