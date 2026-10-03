import { stubTemplate } from "./stub";

export interface AdminRenderFailedProps {
  displayName: string;
  /** The error summary (at most 300 characters, no stack). */
  error: string;
  gestureName: string | null;
  /** `/admin/sponsorships/<id>`. */
  url: string;
}

/**
 * `admin_render_failed` (E-07): to every admin when a render fails (`admin_render_failed:<renderJobId>:<adminId>`).
 * A stub until phase 6 task 2 designs it.
 */
export const adminRenderFailed =
  stubTemplate<AdminRenderFailedProps>("adminRenderFailed");
