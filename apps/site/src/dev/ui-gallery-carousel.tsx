import { useTranslation } from "@smog/i18n/react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@smog/ui-web/carousel";
import type { ReactNode } from "react";

/** The lazy half of the gallery's `carousel` section (its own chunk). */
export default function CarouselDemo(): ReactNode {
  const { t } = useTranslation();
  const slides = [
    t("devTools.gallery.gestureHello"),
    t("devTools.gallery.gestureThankYou"),
    t("devTools.gallery.gestureHappy"),
  ];
  return (
    <div className="mx-12 max-w-reading">
      <Carousel aria-label={t("nav.gestures")}>
        <CarouselContent>
          {slides.map((slide) => (
            <CarouselItem key={slide}>
              <div className="grid h-32 place-items-center rounded-2xl bg-muted font-medium text-title-3">
                {slide}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  );
}
