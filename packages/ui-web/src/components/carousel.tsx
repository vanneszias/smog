import { useTranslation } from "@smog/i18n/react";
import useEmblaCarousel, {
  type UseEmblaCarouselType,
} from "embla-carousel-react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type KeyboardEvent,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { cn } from "../lib/cn";

import { IconButton, type IconButtonProps } from "./icon-button";

type CarouselApi = UseEmblaCarouselType[1];
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>;
type CarouselOptions = UseCarouselParameters[0];
type CarouselPlugin = UseCarouselParameters[1];

interface CarouselProps {
  opts?: CarouselOptions;
  orientation?: "horizontal" | "vertical";
  plugins?: CarouselPlugin;
  setApi?: (api: CarouselApi) => void;
}

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
  api: ReturnType<typeof useEmblaCarousel>[1];
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
} & CarouselProps;

const CarouselContext = createContext<CarouselContextProps | null>(null);

function useCarousel() {
  const context = useContext(CarouselContext);

  if (!context) {
    throw new Error("useCarousel must be used within a <Carousel />");
  }

  return context;
}

function Carousel({
  orientation = "horizontal",
  opts,
  setApi,
  plugins,
  className,
  children,
  ...props
}: ComponentProps<"section"> & CarouselProps) {
  const { t } = useTranslation();
  const [carouselRef, api] = useEmblaCarousel(
    {
      ...opts,
      axis: orientation === "horizontal" ? "x" : "y",
    },
    plugins
  );
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const onSelect = useCallback((selected: CarouselApi) => {
    if (!selected) {
      return;
    }
    setCanScrollPrev(selected.canScrollPrev());
    setCanScrollNext(selected.canScrollNext());
  }, []);

  const scrollPrev = useCallback(() => {
    api?.scrollPrev();
  }, [api]);

  const scrollNext = useCallback(() => {
    api?.scrollNext();
  }, [api]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        scrollPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        scrollNext();
      }
    },
    [scrollPrev, scrollNext]
  );

  useEffect(() => {
    if (!(api && setApi)) {
      return;
    }
    setApi(api);
  }, [api, setApi]);

  useEffect(() => {
    if (!api) {
      return;
    }
    onSelect(api);
    api.on("reInit", onSelect);
    api.on("select", onSelect);

    return () => {
      api?.off("select", onSelect);
    };
  }, [api, onSelect]);

  return (
    <CarouselContext.Provider
      value={{
        api,
        canScrollNext,
        canScrollPrev,
        carouselRef,
        opts,
        orientation:
          orientation || (opts?.axis === "y" ? "vertical" : "horizontal"),
        scrollNext,
        scrollPrev,
      }}
    >
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: a section named by the caller (aria-label) is a region */}
      <section
        aria-roledescription={t("a11y.carousel")}
        className={cn("relative", className)}
        data-slot="carousel"
        onKeyDownCapture={handleKeyDown}
        {...props}
      >
        {children}
      </section>
    </CarouselContext.Provider>
  );
}

function CarouselContent({ className, ...props }: ComponentProps<"div">) {
  const { carouselRef, orientation } = useCarousel();

  return (
    <div
      className="overflow-hidden"
      data-slot="carousel-content"
      ref={carouselRef}
    >
      <div
        className={cn(
          "flex",
          orientation === "horizontal" ? "-ml-4" : "-mt-4 flex-col",
          className
        )}
        {...props}
      />
    </div>
  );
}

function CarouselItem({ className, ...props }: ComponentProps<"div">) {
  const { t } = useTranslation();
  const { orientation } = useCarousel();

  return (
    // biome-ignore lint/a11y/useSemanticElements: an APG carousel slide is a role=group with a roledescription (a fieldset would be a form group)
    <div
      aria-roledescription={t("a11y.slide")}
      className={cn(
        "min-w-0 shrink-0 grow-0 basis-full",
        orientation === "horizontal" ? "pl-4" : "pt-4",
        className
      )}
      data-slot="carousel-item"
      role="group"
      {...props}
    />
  );
}

function CarouselPrevious({
  className,
  label,
  variant = "secondary",
  ...props
}: Omit<IconButtonProps, "icon" | "label"> & { label?: string }) {
  const { t } = useTranslation();
  const { orientation, scrollPrev, canScrollPrev } = useCarousel();

  return (
    <IconButton
      className={cn(
        "absolute touch-manipulation",
        orientation === "horizontal"
          ? "inset-y-0 -left-14 my-auto"
          : "-top-14 left-1/2 -translate-x-1/2 rotate-90",
        className
      )}
      data-slot="carousel-previous"
      disabled={!canScrollPrev}
      icon={<ChevronLeftIcon />}
      label={label ?? t("a11y.previousSlide")}
      onClick={scrollPrev}
      variant={variant}
      {...props}
    />
  );
}

function CarouselNext({
  className,
  label,
  variant = "secondary",
  ...props
}: Omit<IconButtonProps, "icon" | "label"> & { label?: string }) {
  const { t } = useTranslation();
  const { orientation, scrollNext, canScrollNext } = useCarousel();

  return (
    <IconButton
      className={cn(
        "absolute touch-manipulation",
        orientation === "horizontal"
          ? "inset-y-0 -right-14 my-auto"
          : "-bottom-14 left-1/2 -translate-x-1/2 rotate-90",
        className
      )}
      data-slot="carousel-next"
      disabled={!canScrollNext}
      icon={<ChevronRightIcon />}
      label={label ?? t("a11y.nextSlide")}
      onClick={scrollNext}
      variant={variant}
      {...props}
    />
  );
}

export {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  useCarousel,
};
