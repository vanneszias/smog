import { Text } from "@smog/ui-web";
import { type ReactNode, useState } from "react";
import { VideoField, type VideoFieldValue } from "./video-field";

/**
 * `VideoField` with local state and its value printed under it: the
 * `/admin/dev/video-field` preview (dev and staging only).
 */
export function VideoFieldPreview(): ReactNode {
  const [value, setValue] = useState<VideoFieldValue | null>(null);
  return (
    // The deploy guard's proof that production compiled this page out.
    <div
      className="flex max-w-content flex-col gap-4"
      data-dev-preview="video-field"
    >
      <VideoField onChange={setValue} value={value} />
      <Text
        as="div"
        className="break-all font-mono"
        data-testid="video-field-value"
        size="caption"
        tone="muted"
      >
        {JSON.stringify(value)}
      </Text>
    </div>
  );
}
