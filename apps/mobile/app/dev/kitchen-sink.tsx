import {
  Avatar,
  Badge,
  Button,
  Card,
  CategoryFilter,
  EmptyState,
  GestureCard,
  GestureGrid,
  Input,
  SearchBar,
  Sheet,
  Skeleton,
  StatusBadge,
  Switch,
  Text,
  useToast,
  VideoPlayer,
} from "@smog/ui-native";
import { getLocales } from "expo-localization";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { resolveLocale } from "@/lib/locale";

const CATEGORIES = [
  { id: "greetings", name: "Groeten" },
  { id: "family", name: "Familie" },
];

const GESTURES = [
  { id: "hello", name: "Hallo", categories: [CATEGORIES[0]] },
  { id: "thanks", name: "Dank je", categories: [CATEGORIES[0]] },
];

/**
 * One of each `@smog/ui-native` component, rendered inside a real Expo app
 * rather than under Jest — the native counterpart of `apps/site`'s web
 * kitchen-sink route.
 *
 * This screen is the only check that a running app actually applies
 * NativeWind's classes: the package's own 142 tests pass whether or
 * not `apps/mobile/tailwind.config.js`'s third `content` glob is present,
 * because Tailwind never runs under Jest at all (see
 * `packages/ui-native/jest.setup.ts`, which compiles `global.css` by hand
 * for exactly that reason). Only Metro, building this screen, tells the
 * difference between styled and unstyled.
 */
export default function KitchenSink() {
  const toast = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [query, setQuery] = useState("");

  const detectedLocale = resolveLocale(
    getLocales().map((locale) => locale.languageTag)
  );

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-lg p-lg"
    >
      <Text size="xl" variant="heading">
        Kitchen sink
      </Text>
      <Text variant="muted">
        Detected locale: {detectedLocale} · resolved from the device's own
        preferred languages via `expo-localization`.
      </Text>

      <View className="gap-sm">
        <Text variant="heading">Primitives</Text>
        <View className="flex-row items-center gap-md">
          <Avatar name="Ada Lovelace" />
          <Badge variant="primary">Nieuw</Badge>
          <Button onPress={() => toast.show("Knop ingedrukt")}>
            Toon toast
          </Button>
        </View>
        <Card className="p-md">
          <Text>Een kaart met wat inhoud.</Text>
        </Card>
        <Input label="E-mailadres" placeholder="naam@voorbeeld.be" />
        <Switch
          label="Meldingen"
          onValueChange={setNotifications}
          value={notifications}
        />
        <Skeleton className="h-6 w-32" />
        <StatusBadge status="active" />
        <Button onPress={() => setSheetOpen(true)} variant="secondary">
          Open sheet
        </Button>
        <Sheet
          onClose={() => setSheetOpen(false)}
          open={sheetOpen}
          title="Filters"
        >
          <Text>Inhoud van het sheet.</Text>
        </Sheet>
      </View>

      <View className="gap-sm">
        <Text variant="heading">Domain</Text>
        <SearchBar onSearch={setQuery} placeholder="Zoek een gebaar" />
        <Text variant="muted">Laatst gezocht: {query || "—"}</Text>
        <CategoryFilter
          categories={CATEGORIES}
          onChange={setSelectedCategory}
          selected={selectedCategory}
        />
        <GestureCard
          gesture={GESTURES[0]}
          isFavorite={isFavorite}
          onFavorite={() => setIsFavorite((current) => !current)}
        />
        <VideoPlayer playbackId={null} title="Voorbeeldvideo" />
        <View className="h-48">
          <GestureGrid gestures={GESTURES} />
        </View>
        <EmptyState
          description="Er zijn hier nog geen gebaren."
          title="Geen resultaten"
        />
      </View>
    </ScrollView>
  );
}
