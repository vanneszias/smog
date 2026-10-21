import { useTranslation } from "@smog/i18n/react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@smog/ui-web/command";
import { Heart, Search } from "lucide-react";
import type { ReactNode } from "react";

/** The lazy half of the gallery's `command` section (its own chunk). */
export default function CommandDemo(): ReactNode {
  const { t } = useTranslation();
  return (
    <Command className="h-auto max-w-reading rounded-2xl border border-border">
      <CommandInput />
      <CommandList>
        <CommandEmpty />
        <CommandGroup heading={t("nav.gestures")}>
          <CommandItem>
            <Search aria-hidden="true" />
            {t("devTools.gallery.gestureHello")}
          </CommandItem>
          <CommandItem>
            <Heart aria-hidden="true" />
            {t("devTools.gallery.gestureThankYou")}
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t("nav.lists")}>
          <CommandItem>{t("devTools.gallery.listSchool")}</CommandItem>
          <CommandItem>{t("devTools.gallery.listHome")}</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
