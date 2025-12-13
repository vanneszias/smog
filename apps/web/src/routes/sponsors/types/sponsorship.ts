export type SponsorshipStep = "upload" | "preview" | "details" | "payment";

export type SponsorshipFormData = {
  imageFile: File | null;
  imagePreview: string | null;
  overlayText: string;
  durationWeeks: number;
  sponsorName: string;
  sponsorEmail: string;
  composedVideoUrl: string | null;
  tempVideoUrl: string | null;
};

export type CompositionProgress = {
  isComposing: boolean;
  progress: number;
};
