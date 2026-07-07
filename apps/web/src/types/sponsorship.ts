/**
 * Public payment confirmation summary. Contact, invoice, token, and media
 * fields intentionally stay server-side.
 */
export interface SponsorshipWithGesture {
  gestureName?: string;
  sponsorName: string;
  durationYears: number;
  status: string;
  paymentAmount: number;
}
