import { Globe2, Lock, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ListRecord } from "./types";

export function getListStatusLabel(
  list: Pick<
    ListRecord,
    "allowSharedEditing" | "isDefaultFavorites" | "visibility"
  >,
  t: (key: string, fallback: string) => string
) {
  if (list.isDefaultFavorites) {
    return t("web.lists.defaultList", "Default list");
  }
  if (list.visibility === "shared") {
    return list.allowSharedEditing
      ? t("web.lists.sharedEditable", "Shared, editable")
      : t("web.lists.shared", "Shared");
  }
  return t("web.lists.private", "Private");
}

export function ListStatusBadge({
  className,
  list,
}: {
  className?: string;
  list: Pick<
    ListRecord,
    "allowSharedEditing" | "isDefaultFavorites" | "visibility"
  >;
}) {
  const { t } = useTranslation();
  const Icon = list.isDefaultFavorites
    ? Star
    : list.visibility === "shared"
      ? Globe2
      : Lock;

  return (
    <Badge
      className={cn(
        "gap-1.5 border-border bg-background text-foreground",
        list.visibility === "shared" && "border-primary/30 bg-primary/10",
        className
      )}
      variant="outline"
    >
      <Icon className="h-3.5 w-3.5" />
      {getListStatusLabel(list, t)}
    </Badge>
  );
}
