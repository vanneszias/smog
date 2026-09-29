import { COURSE_URL } from "@smog/config/constants";
import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  Card,
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
} from "@smog/ui-web";
import { GripVertical, ListPlus, Plus, Search } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";

/*
 * `/dev/ui` domain sections (spec §16 "Domain"): the learning components
 * with sample data. Section titles are code names; sample names come from
 * `devTools.gallery.*`. `data-gallery="domain"` is the e2e screenshot target.
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
      make("sad", t("devTools.gallery.gestureSad"), [feelings]),
    ];
  }, [t]);
}

function useFavorites(): {
  isFavorite: (id: string) => boolean;
  toggle: (id: string) => (next: boolean) => void;
} {
  const [ids, setIds] = useState<ReadonlySet<string>>(
    () => new Set(["thank-you"])
  );
  const toggle = useCallback(
    (id: string) =>
      (next: boolean): void => {
        setIds((current) => {
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
  const isFavorite = useCallback((id: string): boolean => ids.has(id), [ids]);
  return { isFavorite, toggle };
}

function Section({
  children,
  name,
}: {
  children: ReactNode;
  name: string;
}): ReactNode {
  return (
    <section className="flex flex-col gap-4">
      <Heading level={3} tone="muted">
        {name}
      </Heading>
      {children}
    </section>
  );
}

export function DomainShowcase(): ReactNode {
  return (
    <div className="flex flex-col gap-10" data-gallery="domain">
      <CardsSection />
      <RowsSection />
      <FiltersSection />
      <VideoSection />
      <ListsSection />
      <SearchSection />
      <EmptySection />
    </div>
  );
}

function CardsSection(): ReactNode {
  const gestures = useSampleGestures();
  const { isFavorite, toggle } = useFavorites();
  const renderCard = useCallback(
    (gesture: GestureCardData, index: number): ReactNode => (
      <GestureCard
        favorite={isFavorite(gesture.id)}
        gesture={gesture}
        href={`#${gesture.slug}`}
        level={4}
        onFavoriteToggle={toggle(gesture.id)}
        sponsored={index === 0}
      />
    ),
    [isFavorite, toggle]
  );
  return (
    <Section name="GestureCard / GestureGrid">
      <GestureGrid
        className="lg:grid-cols-3 xl:grid-cols-3"
        items={gestures.slice(0, 3)}
        renderItem={renderCard}
      />
    </Section>
  );
}

function RowsSection(): ReactNode {
  const { t } = useTranslation();
  const gestures = useSampleGestures();
  const { isFavorite, toggle } = useFavorites();
  return (
    <Section name="GestureRow">
      <Card className="gap-0 p-2 sm:p-2">
        {gestures.slice(2, 5).map((gesture) => (
          <GestureRow
            dragHandle={
              <IconButton
                icon={<GripVertical />}
                label={t("a11y.dragHandle")}
                size="md"
              />
            }
            favorite={isFavorite(gesture.id)}
            gesture={gesture}
            href={`#${gesture.slug}`}
            key={gesture.id}
            onFavoriteToggle={toggle(gesture.id)}
          />
        ))}
      </Card>
    </Section>
  );
}

function FiltersSection(): ReactNode {
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
          onChange={setSelected}
          selected={selected}
        />
      </Section>
      <Section name="FavoriteButton">
        <div className="flex flex-wrap items-center gap-3">
          <FavoriteButton active={active} onToggle={setActive} size="sm" />
          <FavoriteButton active={!active} onToggle={noop} size="md" />
          <FavoriteButton active={active} onToggle={setActive} size="lg" />
          <FavoriteButton
            active={active}
            onToggle={setActive}
            variant="overlay"
          />
        </div>
      </Section>
    </>
  );
}

function VideoSection(): ReactNode {
  const { t } = useTranslation();
  const [banner, setBanner] = useState(true);
  const dismiss = useCallback((): void => {
    setBanner(false);
  }, []);
  return (
    <Section name="VideoPlayer / CourseBanner">
      <div className="flex max-w-reading flex-col gap-3">
        <div className="w-full max-w-reading self-center sm:w-2/3">
          <VideoSample title={t("devTools.gallery.gestureHello")} />
        </div>
        {banner ? (
          <CourseBanner
            courseUrl={COURSE_URL}
            messageIndex={2}
            onDismiss={dismiss}
          />
        ) : null}
        <CourseBanner courseUrl={COURSE_URL} messageIndex={4} />
      </div>
    </Section>
  );
}

/**
 * The player mounts on demand, so the gallery makes no Mux requests until
 * asked (the page is also opened offline).
 */
function VideoSample({ title }: { title: string }): ReactNode {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [nearEnd, setNearEnd] = useState(0);
  const start = useCallback((): void => {
    setShow(true);
  }, []);
  const onNearEnd = useCallback((): void => {
    setNearEnd((count) => count + 1);
  }, []);
  if (!show) {
    return (
      <div className="flex aspect-3/4 w-full items-center justify-center rounded-lg bg-surface-sunken">
        <Button onClick={start} variant="secondary">
          {t("a11y.playVideo")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <VideoPlayer
        autoPlay
        loop
        onNearEnd={onNearEnd}
        playbackId={SAMPLE_PLAYBACK_ID}
        title={title}
      />
      <p className="text-caption text-foreground-muted">
        onNearEnd × {nearEnd}
      </p>
    </div>
  );
}

function ListsSection(): ReactNode {
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
        <div>
          <ListPicker
            description={t("devTools.gallery.gestureHello")}
            lists={lists}
            nameMaxLength={80}
            onCreate={create}
            onToggle={toggle}
          >
            <Button icon={<ListPlus />} variant="secondary">
              {t("lists.addToList")}
            </Button>
          </ListPicker>
        </div>
      </Section>
      <Section name="ShareLink">
        <div className="grid gap-4 lg:grid-cols-2">
          <ShareLink
            access="view"
            onCopy={noop}
            onRevoke={noop}
            url={SAMPLE_SHARE_URL}
          />
          <ShareLink
            access="edit"
            onCopy={noop}
            onRevoke={noop}
            url={`${SAMPLE_SHARE_URL}-edit`}
          />
        </div>
      </Section>
    </>
  );
}

function SearchSection(): ReactNode {
  const { t } = useTranslation();
  const gestures = useSampleGestures();
  const renderCard = useCallback(
    (gesture: GestureCardData): ReactNode => (
      <GestureCard gesture={gesture} href={`#${gesture.slug}`} level={4} />
    ),
    []
  );
  return (
    <Section name="SearchResults">
      <SearchResults
        className="[&_ul]:lg:grid-cols-3 [&_ul]:xl:grid-cols-3"
        items={gestures.slice(3, 6)}
        onRetry={noop}
        renderItem={renderCard}
        state="results"
      />
      <SearchResults
        className="[&>div]:lg:grid-cols-3 [&>div]:xl:grid-cols-3"
        items={[]}
        onRetry={noop}
        skeletonCount={3}
        state="loading"
      />
      <Card>
        <SearchResults
          emptyAction={
            <Button icon={<Search />} variant="secondary">
              {t("search.allCategories")}
            </Button>
          }
          items={[]}
          onRetry={noop}
          state="empty"
        />
      </Card>
      <Card>
        <SearchResults items={[]} onRetry={noop} state="error" />
      </Card>
    </Section>
  );
}

function EmptySection(): ReactNode {
  const { t } = useTranslation();
  return (
    <Section name="FavoritesEmptyState / ListsEmptyState / ListItemsEmptyState / SearchIdleEmptyState">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <FavoritesEmptyState
            action={<Button>{t("nav.browse")}</Button>}
            level={4}
          />
        </Card>
        <Card>
          <ListsEmptyState
            action={<Button icon={<Plus />}>{t("lists.newList")}</Button>}
            level={4}
          />
        </Card>
        <Card>
          <ListItemsEmptyState level={4} />
        </Card>
        <Card>
          <SearchResults items={[]} onRetry={noop} state="idle" />
        </Card>
      </div>
    </Section>
  );
}
