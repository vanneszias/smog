/**
 * Public payment confirmation summary. Contact, invoice, token, and media
 * fields intentionally stay server-side.
 */
export interface SponsorshipWithGesture {
  durationYears: number;
  gestureName?: string;
  paymentAmount: number;
  sponsorName: string;
  status: string;
}
