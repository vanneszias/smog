import { createLogger } from "@smog/shared";
import type { GestureCardData } from "@smog/ui";
import { GestureList } from "@smog/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ListPlus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useConvexUserId } from "@/lib/convex-user-sync";
import { useFavorites } from "@/lib/favorites-context";
import { client } from "@/utils/orpc";

const logger = createLogger("favorites");

export const Route = createFileRoute("/favorites")({
  component: FavoritesComponent,
});

function FavoritesComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const convexUserId = useConvexUserId();
  const { favoriteIds, toggleFavorite } = useFavorites();
  const [lists, setLists] = useState<
    Array<{
      _id: string;
      name: string;
      visibility: "private" | "shared";
      allowSharedEditing: boolean;
      isDefaultFavorites: boolean;
      viewShareToken?: string;
      editShareToken?: string;
    }>
  >([]);
  const [newListName, setNewListName] = useState("");
  const [favoriteGestures, setFavoriteGestures] = useState<GestureCardData[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);

  // Fetch favorite gestures with full data
  useEffect(() => {
    async function loadFavorites() {
      if (!convexUserId) {
        setFavoriteGestures([]);
        return;
      }

      setIsLoading(true);
      try {
        await client.lists.initialize();
        const userLists = await client.lists.getMyLists();
        const gestures = await client.favorites.getUserFavoriteGestures({
          convexUserId,
        });
        setLists(userLists);
        setFavoriteGestures(gestures);
      } catch (error) {
        logger.error("Failed to load favorite gestures:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadFavorites();
  }, [convexUserId]);

  const handleSelectGesture = (gestureId: string) => {
    navigate({ to: "/gestures/$id", params: { id: gestureId } });
  };

  const handleToggleFavorite = (gestureId: string) => {
    const gesture = favoriteGestures.find((g) => g._id === gestureId);
    toggleFavorite(gestureId, gesture?.name);
  };

  const handleCreateList = async () => {
    const name = newListName.trim();
    if (!name) {
      return;
    }

    await client.lists.create({
      name,
      visibility: "private",
      allowSharedEditing: false,
    });
    setNewListName("");
    setLists(await client.lists.getMyLists());
  };

  // Show sign in message if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center p-6">
        <ListPlus className="mb-4 h-16 w-16 text-muted-foreground" />
        <h2 className="mb-2 font-bold text-2xl">
          {t("web.lists.signInTitle", "Sign in to manage lists")}
        </h2>
        <p className="text-center text-muted-foreground">
          {t(
            "web.lists.signInDescription",
            "Create, reorder, and share gesture lists across your devices."
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-border border-b p-4 lg:px-12">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-bold text-2xl">
              {t("web.lists.title", "Lists")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t(
                "web.lists.description",
                "Create gesture collections, keep them private, or share them with others."
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <input
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              onChange={(event) => setNewListName(event.target.value)}
              placeholder={t("web.lists.newListPlaceholder", "New list name")}
              value={newListName}
            />
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground text-sm hover:bg-primary/90"
              onClick={handleCreateList}
              type="button"
            >
              <Plus className="h-4 w-4" />
              {t("web.lists.create", "Create")}
            </button>
          </div>
        </div>
        {lists.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {lists.map((list) => (
              <div
                className="rounded-xl border border-border bg-card p-4"
                key={list._id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{list.name}</h2>
                    <p className="text-muted-foreground text-xs">
                      {list.isDefaultFavorites
                        ? t("web.lists.defaultList", "Default list")
                        : list.visibility === "shared"
                          ? t("web.lists.shared", "Shared")
                          : t("web.lists.private", "Private")}
                    </p>
                  </div>
                  {list.allowSharedEditing ? (
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-primary text-xs">
                      {t("web.lists.editable", "Editable")}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : favoriteGestures.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <ListPlus className="mb-4 h-16 w-16 text-muted-foreground" />
            <h2 className="mb-2 font-bold text-xl">
              {t("web.lists.noGesturesTitle", "No gestures in Favorites yet")}
            </h2>
            <p className="mb-4 text-muted-foreground">
              {t(
                "web.lists.noGesturesDescription",
                "Use the plus button on any gesture to add it to your latest list."
              )}
            </p>
            <button
              className="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate({ to: "/gestures" })}
              type="button"
            >
              {t("web.favorites.browseGestures")}
            </button>
          </div>
        ) : (
          <GestureList
            favoriteGestureIds={favoriteIds}
            gestures={favoriteGestures}
            isLoading={isLoading}
            onSelectGesture={handleSelectGesture}
            onToggleFavorite={handleToggleFavorite}
            selectedGestureId={null}
          />
        )}
      </div>
    </div>
  );
}
