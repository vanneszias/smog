import type { ReactElement } from "react";
import { ComponentGallery } from "@/dev/component-gallery";

/** Settings → Developer tools → Component gallery (spec §16). */
export default function GalleryScreen(): ReactElement {
  return <ComponentGallery />;
}
