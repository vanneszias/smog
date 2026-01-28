export type SponsorshipStep = "upload" | "preview" | "details" | "payment";

export interface SponsorshipFormData {
  imageFile: File | null;
  imagePreview: string | null;
  overlayText: string;
  durationWeeks: number;
  sponsorName: string;
  sponsorEmail: string;
  composedVideoUrl: string | null;
  tempVideoUrl: string | null;
}

export interface CompositionProgress {
  isComposing: boolean;
  progress: number;
}
