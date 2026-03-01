import { Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const APP_STORE_URL = "https://apps.apple.com/app/smog-co/id6758547774";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=be.zias.smog";
const STORAGE_KEY = "app-store-banner-dismissed";

interface ConfettiPiece {
  id: number;
  left: string;
  delay: string;
  duration: string;
  color: string;
}

export function AppStoreBanner() {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);

  const generateConfetti = useCallback(() => {
    const pieces: ConfettiPiece[] = [];
    const colors = ["#00805f", "#ee971c", "#97c699", "#f0c814", "#ffffff"];

    for (let i = 0; i < 30; i++) {
      pieces.push({
        id: i,
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 0.5}s`,
        duration: `${1 + Math.random() * 2}s`,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
    setConfetti(pieces);
  }, []);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) {
      setIsDismissed(true);
    } else {
      // Delay appearance for smooth entrance
      const timer = setTimeout(() => {
        setIsVisible(true);
        generateConfetti();
        setHasAnimated(true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [generateConfetti]);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsDismissed(true);
  };

  if (isDismissed || !isVisible) {
    return null;
  }

  return (
    <div
      className={`relative z-[55] overflow-hidden bg-gradient-to-r from-primary to-[#006b4f] transition-all duration-500 ease-out ${
        isVisible && hasAnimated
          ? "translate-y-0 opacity-100"
          : "-translate-y-full opacity-0"
      }`}
    >
      {/* Confetti Animation */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {confetti.map((piece) => (
          <div
            className="confetti"
            key={piece.id}
            style={{
              animationDelay: piece.delay,
              animationDuration: piece.duration,
              backgroundColor: piece.color,
              left: piece.left,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          {/* Text Content */}
          <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-4">
            {/* "New" Badge */}
            <span className="rounded-full bg-accent px-3 py-1 font-bold text-white text-xs uppercase tracking-wide shadow-lg">
              {t("appStore.new", "Nieuw")}
            </span>

            {/* Main Text */}
            <div className="text-center sm:text-left">
              <p className="font-bold text-lg text-white sm:text-xl">
                {t(
                  "appStore.headline",
                  "SMOG is nu beschikbaar op je telefoon!"
                )}
              </p>
              <p className="text-sm text-white/80">
                {t(
                  "appStore.subheadline",
                  "Download de app en leer gebaren waar je ook bent"
                )}
              </p>
            </div>
          </div>

          {/* Store Buttons */}
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            {/* App Store Button */}
            <a
              className="group flex items-center gap-2 rounded-xl border-2 border-white/20 bg-black/20 px-4 py-2.5 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:border-white/40 hover:bg-black/30"
              href={APP_STORE_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              {/* Apple Logo */}
              <svg
                aria-hidden="true"
                className="h-6 w-6 text-white"
                fill="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              <div className="flex flex-col">
                <span className="text-white/70 text-xs leading-none">
                  {t("appStore.downloadOn", "Download op de")}
                </span>
                <span className="font-semibold text-sm text-white leading-none">
                  App Store
                </span>
              </div>
            </a>

            {/* Play Store Button */}
            <a
              className="group flex items-center gap-2 rounded-xl border-2 border-white/20 bg-black/20 px-4 py-2.5 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:border-white/40 hover:bg-black/30"
              href={PLAY_STORE_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Smartphone className="h-6 w-6 text-white" />
              <div className="flex flex-col">
                <span className="text-white/70 text-xs leading-none">
                  {t("appStore.getItOn", "Beschikbaar op")}
                </span>
                <span className="font-semibold text-sm text-white leading-none">
                  Google Play
                </span>
              </div>
            </a>

            {/* Close Button */}
            <button
              aria-label={t("appStore.close", "Sluit banner")}
              className="ml-0 flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-all duration-200 hover:bg-white/20 hover:text-white sm:ml-2"
              onClick={handleDismiss}
              type="button"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Decorative Gradient Orbs */}
      <div
        aria-hidden="true"
        className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-accent/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-white/10 blur-3xl"
      />
    </div>
  );
}
