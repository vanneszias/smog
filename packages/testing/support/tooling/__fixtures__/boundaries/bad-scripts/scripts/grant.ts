import { createAdminRouter } from "@smog/admin/server";
import { maintenanceSettingSchema } from "@smog/config/maintenance";
import { gestureSchema } from "@smog/gestures/schema";

export const used = [
  createAdminRouter,
  maintenanceSettingSchema,
  gestureSchema,
];
