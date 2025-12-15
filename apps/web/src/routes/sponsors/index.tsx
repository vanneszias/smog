import { GestureList } from "@smog/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Sparkles, Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useGestures } from "@/hooks/useGestures";

export const Route = createFileRoute("/sponsors/")({
  component: SponsorsComponent,
});

function SponsorsComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { gestures: allGestures, isLoading, error } = useGestures();
  const [selectedGestureIds, setSelectedGestureIds] = useState<string[]>([]);

  const handleSelectGesture = (gestureId: string) => {
    setSelectedGestureIds((prev) =>
      prev.includes(gestureId)
        ? prev.filter((id) => id !== gestureId)
        : [...prev, gestureId]
    );
  };

  const handleContinue = () => {
    if (selectedGestureIds.length > 0) {
      navigate({
        to: "/sponsors/create",
        search: { gestureIds: selectedGestureIds.join(",") },
      });
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b bg-background px-6 py-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-primary" />
            <h1 className="font-bold text-3xl">
              {t("web.sponsors.title", "Sponsor Gestures")}
            </h1>
          </div>
          <p className="text-muted-foreground">
            {t(
              "web.sponsors.description",
              "Select one or more gestures to sponsor. Each video will have your custom outro with branding and message."
            )}
          </p>

          {/* Selection Counter and Action */}
          {selectedGestureIds.length > 0 && (
            <div className="mt-4 flex items-center gap-4">
              <div className="rounded-lg bg-primary/10 px-4 py-2">
                <span className="font-medium">
                  {selectedGestureIds.length}{" "}
                  {selectedGestureIds.length === 1
                    ? t("web.sponsors.gestureSelected", "gesture selected")
                    : t("web.sponsors.gesturesSelected", "gestures selected")}
                </span>
              </div>
              <Button onClick={handleContinue} size="lg">
                <Upload className="mr-2 h-4 w-4" />
                {t("web.sponsors.continue", "Continue to Upload")}
              </Button>
              <Button
                onClick={() => setSelectedGestureIds([])}
                size="lg"
                variant="outline"
              >
                {t("web.sponsors.clearSelection", "Clear Selection")}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Gesture List */}
      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : allGestures.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <div>
              <Sparkles className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
              <h2 className="mb-2 font-bold text-xl">
                {t("web.sponsors.noGestures", "No gestures available")}
              </h2>
              <p className="text-muted-foreground">
                {t(
                  "web.sponsors.noGesturesDescription",
                  "Check back later for available gestures to sponsor."
                )}
              </p>
            </div>
          </div>
        ) : (
          <GestureList
            error={error}
            gestures={allGestures.map((g) => ({
              ...g,
              // Add a visual indicator for selected gestures
              _isSelected: selectedGestureIds.includes(g._id),
            }))}
            isLoading={isLoading}
            onSelectGesture={handleSelectGesture}
            selectedGestureId={
              selectedGestureIds.length === 1 ? selectedGestureIds[0] : null
            }
          />
        )}
      </div>

      {/* Info Section */}
      {!isLoading && allGestures.length > 0 && (
        <div className="border-t bg-muted/30 px-6 py-6">
          <div className="mx-auto max-w-7xl">
            <h2 className="mb-4 font-semibold text-lg">
              {t("web.sponsors.howItWorks", "How It Works")}
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">
                  1
                </div>
                <h3 className="mb-2 font-semibold">
                  {t("web.sponsors.step1Title", "Select Gestures")}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {t(
                    "web.sponsors.step1Description",
                    "Choose one or more gestures from the list. All will use the same outro."
                  )}
                </p>
              </div>
              <div>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">
                  2
                </div>
                <h3 className="mb-2 font-semibold">
                  {t("web.sponsors.step2Title", "Upload & Customize")}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {t(
                    "web.sponsors.step2Description",
                    "Upload your image and add custom text for the outro overlay."
                  )}
                </p>
              </div>
              <div>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">
                  3
                </div>
                <h3 className="mb-2 font-semibold">
                  {t("web.sponsors.step3Title", "Preview & Pay")}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {t(
                    "web.sponsors.step3Description",
                    "Review your videos and complete payment to go live."
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
