import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { calculatePrice } from "@/lib/pricing";
import { client } from "@/utils/orpc";
import { createImagePreview, validateImageFile } from "../lib/imageValidation";
import { createSponsorshipPayment } from "../lib/sponsorshipPayment";
import { composeVideo } from "../lib/videoComposition";
import type { SponsorshipStep } from "../types/sponsorship";

export type UseSponsorshipFormParams = {
  gestureId: string;
};

export function useSponsorshipForm(params: UseSponsorshipFormParams) {
  const { gestureId } = params;

  // Step management
  const [step, setStep] = useState<SponsorshipStep>("upload");

  // Form data
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [overlayText, setText] = useState("");
  const [durationWeeks, setDurationWeeks] = useState(4);
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorEmail, setSponsorEmail] = useState("");

  // Video composition state
  const [composedVideoUrl, _setComposedVideoUrl] = useState<string | null>(
    null
  );
  const [tempVideoUrl, _setTempVideoUrl] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [composeProgress, setComposeProgress] = useState(0);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Queries
  const gesture = useQuery(api.gestures.getById, {
    id: gestureId as Id<"gestures">,
  });

  const activeSponsorship = useQuery(api.sponsorships.getActiveByGesture, {
    gestureId: gestureId as Id<"gestures">,
  });

  // Mutations
  const createSponsorship = useMutation(api.sponsorships.create);
  const updatePaymentId = useMutation(api.sponsorships.updatePaymentId);

  // Check if gesture is already sponsored
  useEffect(() => {
    if (activeSponsorship) {
      setError("This gesture is already sponsored.");
    }
  }, [activeSponsorship]);

  // Image upload handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    // Validate file
    const validation = validateImageFile(file);
    if (!validation.isValid) {
      setError(validation.error ?? "Invalid image file");
      return;
    }

    setImageFile(file);
    setError(null);

    // Create preview
    try {
      const preview = await createImagePreview(file);
      setImagePreview(preview);
    } catch (err) {
      console.error("Error creating image preview:", err);
      setError("Failed to create image preview");
    }
  };

  // Video composition handler
  const handleComposeVideo = async () => {
    if (!(imageFile && gesture)) {
      return;
    }

    setIsComposing(true);
    setError(null);
    setComposeProgress(0);

    const result = await composeVideo(
      {
        imageFile,
        overlayText,
        playbackId: gesture.playbackId,
        onProgress: setComposeProgress,
      },
      client
    );

    setIsComposing(false);

    if (!result.success) {
      setError(result.error ?? "Failed to compose video");
      setComposeProgress(0);
      return;
    }

    // For now, show message about external service
    if (result.error) {
      setError(result.error);
    }
  };

  // Payment submission handler
  const handleSubmit = async () => {
    if (!(tempVideoUrl && imageFile && gesture)) {
      return;
    }

    setError(null);

    const pricing = calculatePrice(durationWeeks);

    const result = await createSponsorshipPayment(
      {
        gestureId: gestureId as Id<"gestures">,
        gestureName: gesture.name,
        sponsorName,
        sponsorEmail,
        imageFile,
        overlayText,
        tempVideoUrl,
        durationWeeks,
        totalCents: pricing.totalCents,
        createSponsorship,
        updatePaymentId,
      },
      client
    );

    if (!result.success) {
      setError(result.error ?? "Failed to create sponsorship");
      return;
    }

    // Redirect to Mollie checkout
    if (result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
    }
  };

  return {
    // Step management
    step,
    setStep,

    // Form data
    imageFile,
    imagePreview,
    overlayText,
    setText,
    durationWeeks,
    setDurationWeeks,
    sponsorName,
    setSponsorName,
    sponsorEmail,
    setSponsorEmail,

    // Video composition
    composedVideoUrl,
    tempVideoUrl,
    isComposing,
    composeProgress,

    // Handlers
    handleImageUpload,
    handleComposeVideo,
    handleSubmit,

    // Data
    gesture,
    activeSponsorship,

    // Error state
    error,
    setError,
  };
}
