import { useGuestImport } from "@smog/account/client";
import type { ImportResult } from "@smog/account/schema";
import { formatList, isLocale } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { LIST_ITEMS_MAX, LISTS_MAX } from "@smog/lists/schema";
import {
  Button,
  Sheet,
  SheetContent,
  SheetFooter,
  Text,
} from "@smog/ui-native";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useState,
} from "react";
import { View } from "react-native";

/** "3 favorieten en 1 lijst", in the page language. */
function useItems(): (favorites: number, lists: number) => string {
  const { i18n, t } = useTranslation();
  const locale = isLocale(i18n.language) ? i18n.language : "nl";
  return useCallback(
    (favorites: number, lists: number) =>
      formatList(
        [
          ...(favorites > 0
            ? [t("auth.import.favorites", { count: favorites })]
            : []),
          ...(lists > 0 ? [t("auth.import.lists", { count: lists })] : []),
        ],
        locale
      ),
    [locale, t]
  );
}

function ResultText({ result }: { result: ImportResult }): ReactElement {
  const { t } = useTranslation();
  const items = useItems();
  const imported = items(
    result.favoritesAdded,
    result.listsCreated + result.listsMerged
  );
  const overLimit = result.listsOverLimit + result.itemsOverLimit > 0;
  return (
    <View accessibilityLiveRegion="polite" className="gap-2">
      <Text>{t("auth.import.success")}</Text>
      {imported ? <Text weight="medium">{imported}</Text> : null}
      {result.skippedUnknownGestures > 0 ? (
        <Text size="body-sm" tone="muted">
          {t("auth.import.skipped", { count: result.skippedUnknownGestures })}
        </Text>
      ) : null}
      {overLimit ? (
        <Text size="body-sm" tone="warning">
          {t("auth.import.overLimit", {
            maxItems: LIST_ITEMS_MAX,
            maxLists: LISTS_MAX,
          })}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The guest import prompt after sign-in (spec §11): offered while the
 * device has favorites or lists this account has not taken or declined,
 * then the result (added, skipped, over the limits). The same flow as the
 * site's sheet, with the native kit.
 */
export function GuestImportSheet(): ReactNode {
  const { t } = useTranslation();
  const items = useItems();
  const guestImport = useGuestImport();
  const { accept, dismiss, pending, result, status } = guestImport;
  const [closed, setClosed] = useState(false);
  const showsResult = status === "done" && result !== null;
  const open = !closed && (pending !== null || showsResult);

  const onOpenChange = useCallback((next: boolean) => {
    if (!next) {
      setClosed(true);
    }
  }, []);
  const skip = useCallback(async () => {
    await dismiss();
    setClosed(true);
  }, [dismiss]);

  if (!open) {
    return null;
  }
  return (
    <Sheet onOpenChange={onOpenChange} open>
      <SheetContent
        description={showsResult ? undefined : t("auth.import.description")}
        title={t("auth.import.title")}
      >
        {showsResult && result ? (
          <>
            <ResultText result={result} />
            <SheetFooter>
              <Button onPress={skip}>{t("common.done")}</Button>
            </SheetFooter>
          </>
        ) : (
          <>
            {pending ? (
              <Text weight="medium">
                {t("auth.import.prompt", {
                  items: items(pending.favorites, pending.lists),
                })}
              </Text>
            ) : null}
            {status === "error" ? (
              <Text accessibilityRole="alert" size="body-sm" tone="danger">
                {t("auth.import.failed")}
              </Text>
            ) : null}
            <SheetFooter>
              <Button
                disabled={status === "importing"}
                onPress={skip}
                variant="ghost"
              >
                {t("auth.import.skip")}
              </Button>
              <Button loading={status === "importing"} onPress={accept}>
                {status === "importing"
                  ? t("auth.import.importing")
                  : t("auth.import.confirm")}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
