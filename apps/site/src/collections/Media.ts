import type { CollectionConfig } from "payload";
import { isAdmin, publicRead } from "@/access";

export const Media: CollectionConfig = {
  slug: "media",
  access: {
    // Media is public by design — gesture thumbnails and sponsor logos are
    // served to anonymous visitors.
    read: publicRead,
    // Writes are not. Payload's default for these is any authenticated user,
    // and registration is public, so leaving them unset meant one signup
    // bought arbitrary R2 uploads, overwrites and deletion of every asset.
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: "alt",
      type: "text",
      required: true,
    },
  ],
  upload: {
    // These are not supported on Workers yet due to lack of sharp
    crop: false,
    focalPoint: false,
  },
};
