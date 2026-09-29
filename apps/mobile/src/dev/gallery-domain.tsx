import { COURSE_URL } from "@smog/config/constants";
import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  CategoryChips,
  CourseBanner,
  FavoriteButton,
  FavoritesEmptyState,
  GestureCard,
  type GestureCardData,
  GestureGrid,
  GestureRow,
  Heading,
  IconButton,
  ListItemsEmptyState,
  ListPicker,
  type ListPickerList,
  ListsEmptyState,
  SearchResults,
  ShareLink,
  VideoPlayer,
} from "@smog/ui-native";
import GripVertical from "lucide-react-native/icons/grip-vertical";
import ListPlus from "lucide-react-native/icons/list-plus";
import Plus from "lucide-react-native/icons/plus";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";
import { View } from "react-native";

/*
 * The component gallery's domain sections (the web's `/dev/ui` has the same
 * ones): the learning components with sample data. Section titles are code
 * names; sample names come from `devTools.gallery.*`.
 */

/** The seed's public sample Mux playback id (`packages/db/scripts/seed.ts`). */
const SAMPLE_PLAYBACK_ID = "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU";
const SAMPLE_SHARE_URL = "https://smog.example/lists/shared/Zm9vYmFyYmF6";

const noop = (): void => undefined;

function useSampleGestures(): GestureCardData[] {
  const { t } = useTranslation();
  return useMemo(() => {
    const greetings = {
      name: t("devTools.gallery.rowGreetings"),
      slug: "greetings",
    };
    const food = { name: t("devTools.gallery.rowFood"), slug: "food" };
    const feelings = {
      name: t("devTools.gallery.rowFeelings"),
      slug: "feelings",
    };
    const make = (
      id: string,
      name: string,
      categories: GestureCardData["categories"]
    ): GestureCardData => ({
      categories,
      id,
      name,
      playbackId: SAMPLE_PLAYBACK_ID,
      slug: id,
    });
    return [
      make("hello", t("devTools.gallery.gestureHello"), [greetings]),
      make("thank-you", t("devTools.gallery.gestureThankYou"), [
        greetings,
        feelings,
      ]),
      make("eat", t("devTools.gallery.gestureEat"), [food]),
      make("drink", t("devTools.gallery.gestureDrink"), [food]),
      make("happy", t("devTools.gallery.gestureHappy"), [feelings]),
    ];
  }, [t]);
}

function Section({
  children,
  name,
}: {
  children: ReactNode;
  name: string;
}): ReactElement {
  return (
    <View className="flex-col gap-4">
      <Heading level={3} tone="muted">
        {name}
      </Heading>
      {children}
    </View>
  );
}

export function DomainGallery(): ReactElement {
  return (
    <View className="flex-col gap-10">
      <CardsSection />
      <FiltersSection />
      <VideoSection />
      <ListsSection />
      <SearchSection />
      <EmptySection />
    </View>
  );
}

function CardsSection(): ReactElement {
  const { t } = useTranslation();
  const gestures = useSampleGestures();
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(
    () => new Set(["thank-you"])
  );
  const toggle = useCallback(
    (id: string) =>
      (next: boolean): void => {
        setFavorites((current) => {
          const copy = new Set(current);
          if (next) {
            copy.add(id);
          } else {
            copy.delete(id);
          }
          return copy;
        });
      },
    []
  );
  const renderCard = useCallback(
    (gesture: GestureCardData, index: number): ReactElement => (
      <GestureCard
        favorite={favorites.has(gesture.id)}
        gesture={gesture}
        onFavoriteToggle={toggle(gesture.id)}
        onPress={noop}
        sponsored={index === 0}
      />
    ),
    [favorites, toggle]
  );
  return (
    <>
      <Section name="GestureCard / GestureGrid">
        <GestureGrid
          items={gestures.slice(0, 3)}
          renderItem={renderCard}
          scrollEnabled={false}
        />
      </Section>
      <Section name="GestureRow">
        {gestures.slice(2, 5).map((gesture) => (
          <GestureRow
            dragHandle={
              <IconButton
                icon={<GripVertical />}
                label={t("a11y.dragHandle")}
              />
            }
            favorite={favorites.has(gesture.id)}
            gesture={gesture}
            key={gesture.id}
            onFavoriteToggle={toggle(gesture.id)}
            onPress={noop}
          />
        ))}
      </Section>
    </>
  );
}

function FiltersSection(): ReactElement {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>(["food"]);
  const [active, setActive] = useState(true);
  const categories = useMemo(
    () => [
      { name: t("devTools.gallery.rowGreetings"), slug: "greetings" },
      { name: t("devTools.gallery.rowFood"), slug: "food" },
      { name: t("devTools.gallery.rowFeelings"), slug: "feelings" },
    ],
    [t]
  );
  return (
    <>
      <Section name="CategoryChips">
        <CategoryChips
          categories={categories}
          className="-mx-4"
          onChange={setSelected}
          selected={selected}
        />
      </Section>
      <Section name="FavoriteButton">
        <View className="flex-row flex-wrap items-center gap-3">
          <FavoriteButton active={active} onToggle={setActive} size="sm" />
          <FavoriteButton active={!active} onToggle={noop} />
          <FavoriteButton active={active} onToggle={setActive} size="lg" />
          <FavoriteButton
            active={active}
            onToggle={setActive}
            variant="overlay"
          />
        </View>
      </Section>
    </>
  );
}

function VideoSection(): ReactElement {
  const { t } = useTranslation();
  const [banner, setBanner] = useState(true);
  const [nearEnd, setNearEnd] = useState(false);
  const dismiss = useCallback((): void => {
    setBanner(false);
  }, []);
  const showBanner = useCallback((): void => {
    setNearEnd(true);
    setBanner(true);
  }, []);
  return (
    <Section name="VideoPlayer / CourseBanner">
      <VideoPlayer
        loop
        onNearEnd={showBanner}
        playbackId={SAMPLE_PLAYBACK_ID}
        title={t("devTools.gallery.gestureHello")}
      />
      {banner ? (
        <CourseBanner
          courseUrl={COURSE_URL}
          messageIndex={nearEnd ? 6 : 2}
          onDismiss={dismiss}
        />
      ) : null}
      <CourseBanner courseUrl={COURSE_URL} messageIndex={4} />
    </Section>
  );
}

function ListsSection(): ReactElement {
  const { t } = useTranslation();
  const [lists, setLists] = useState<ListPickerList[]>(() => [
    { contains: true, id: "school", name: t("devTools.gallery.listSchool") },
    { contains: false, id: "home", name: t("devTools.gallery.listHome") },
  ]);
  const toggle = useCallback((id: string): void => {
    setLists((current) =>
      current.map((list) =>
        list.id === id ? { ...list, contains: !list.contains } : list
      )
    );
  }, []);
  const create = useCallback((name: string): void => {
    setLists((current) => [
      ...current,
      { contains: true, id: `new-${current.length}`, name },
    ]);
  }, []);
  return (
    <>
      <Section name="ListPicker">
        <ListPicker
          description={t("devTools.gallery.gestureHello")}
          lists={lists}
          nameMaxLength={80}
          onCreate={create}
          onToggle={toggle}
        >
          <Button
            className="self-start"
            icon={<ListPlus />}
            variant="secondary"
          >
            {t("lists.addToList")}
          </Button>
        </ListPicker>
      </Section>
      <Section name="ShareLink">
        <ShareLink
          onCopy={noop}
          onRevoke={noop}
          role="view"
          url={SAMPLE_SHARE_URL}
        />
        <ShareLink
          onCopy={noop}
          onRevoke={noop}
          role="edit"
          url={`${SAMPLE_SHARE_URL}-edit`}
        />
      </Section>
    </>
  );
}

function SearchSection(): ReactElement {
  const gestures = useSampleGestures();
  return (
    <Section name="SearchResults">
      <SearchResults
        className="-mx-4"
        items={gestures.slice(3, 5)}
        onRetry={noop}
        scrollEnabled={false}
        state="results"
      />
      <SearchResults
        className="-mx-4"
        items={[]}
        onRetry={noop}
        skeletonCount={2}
        state="loading"
      />
      <SearchResults items={[]} onRetry={noop} state="empty" />
      <SearchResults items={[]} onRetry={noop} state="error" />
    </Section>
  );
}

function EmptySection(): ReactElement {
  const { t } = useTranslation();
  return (
    <Section name="FavoritesEmptyState / ListsEmptyState / ListItemsEmptyState / SearchIdleEmptyState">
      <FavoritesEmptyState action={<Button>{t("nav.browse")}</Button>} />
      <ListsEmptyState
        action={<Button icon={<Plus />}>{t("lists.newList")}</Button>}
      />
      <ListItemsEmptyState />
      <SearchResults items={[]} onRetry={noop} state="idle" />
    </Section>
  );
}
