import { useTranslation } from "react-i18next";

export function HeroTitle() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-210 p-6">
      <h1 className="whitespace-pre-line text-center text-[clamp(0.875rem,5vw,4rem)] text-primary leading-tight">
        {t(
          "web.home.heroTitle",
          "Mensen ondersteunen hun spraak van nature met gebaren"
        )}
      </h1>
    </div>
  );
}
