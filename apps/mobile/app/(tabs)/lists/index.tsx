import {
  Button,
  cardVariants,
  cn,
  EmptyState,
  Input,
  Text,
} from "@smog/ui-native";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { createList, useLists } from "@/data/lists";
import { useSession } from "@/lib/session";

const LOAD_ERROR = "Er ging iets mis bij het laden van je lijsten.";
const RETRY_LABEL = "Probeer opnieuw";
const SIGN_IN_TITLE = "Meld je aan";
const SIGN_IN_DESCRIPTION =
  "Met een account kun je lijsten maken en ze op al je apparaten terugvinden.";
const CREATE_ERROR = "Het maken van de lijst is niet gelukt.";

/**
 * The account's lists — there is deliberately no guest half of this screen.
 * Unlike favourites, `lib/guest.ts` keeps no local list state at all: a list
 * is a named, ordered, shareable thing, and the product decision behind
 * `lib/guest.ts` is that a guest keeps only the one flat favourites array
 * locally. A signed-out visitor is told to sign in rather than shown an
 * empty "lists" screen that looks broken.
 *
 * `SignedInLists` is its own component, not a branch inside this one, so
 * that `useLists` — and the `GET /api/lists` request behind it — is never
 * mounted at all for a signed-out visitor. The Rules of Hooks forbid calling
 * it conditionally in one component; mounting a second component
 * conditionally has the same effect without breaking them.
 */
export default function ListsScreen() {
  const { loading: sessionLoading, user } = useSession();

  if (sessionLoading) {
    return null;
  }

  if (user === null) {
    return (
      <View className="flex-1 items-center justify-center gap-md bg-background p-lg">
        <EmptyState
          action={
            <Button
              onPress={() => router.push("/(auth)/sign-in")}
              testID="go-to-sign-in"
            >
              {SIGN_IN_TITLE}
            </Button>
          }
          description={SIGN_IN_DESCRIPTION}
          testID="lists-signed-out"
          title={SIGN_IN_TITLE}
        />
      </View>
    );
  }

  return <SignedInLists />;
}

function SignedInLists() {
  const { data, error, loading, refetch } = useLists();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();

    if (trimmed === "") {
      return;
    }

    setCreating(true);
    setCreateError(false);

    try {
      const created = await createList({ name: trimmed });
      setName("");
      refetch();
      router.push(`/(tabs)/lists/${created.id}`);
    } catch {
      setCreateError(true);
    } finally {
      setCreating(false);
    }
  };

  return (
    <View className="flex-1 gap-md bg-background p-lg">
      <Text size="xl" variant="heading">
        Lijsten
      </Text>

      <View className="flex-row items-end gap-sm">
        <View className="flex-1">
          <Input
            label="Naam van de nieuwe lijst"
            onChangeText={setName}
            placeholder="Nieuwe lijst"
            testID="new-list-name"
            value={name}
          />
        </View>
        <Button
          disabled={creating || name.trim() === ""}
          loading={creating}
          onPress={handleCreate}
          testID="create-list"
        >
          Maken
        </Button>
      </View>

      {createError ? (
        <Text className="text-danger" testID="create-list-error">
          {CREATE_ERROR}
        </Text>
      ) : null}

      {error ? (
        <View className="flex-1 items-center justify-center gap-md">
          <Text className="text-danger" testID="lists-error">
            {LOAD_ERROR}
          </Text>
          <Button onPress={refetch} testID="retry">
            {RETRY_LABEL}
          </Button>
        </View>
      ) : null}

      {!(error || loading) && (data === null || data.length === 0) ? (
        <EmptyState
          description="Maak je eerste lijst hierboven."
          title="Nog geen lijsten"
        />
      ) : null}

      {!error && data && data.length > 0 ? (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              className={cn(cardVariants({ interactive: true }), "mb-sm")}
              onPress={() => router.push(`/(tabs)/lists/${item.id}`)}
              testID={`list-${item.id}`}
            >
              <View className="flex-row items-center justify-between p-md">
                <View className="min-w-0 flex-1">
                  <Text className="font-semibold text-md" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text variant="muted">
                    {item.itemCount}{" "}
                    {item.itemCount === 1 ? "gebaar" : "gebaren"}
                  </Text>
                </View>
              </View>
            </Pressable>
          )}
          testID="lists-list"
        />
      ) : null}
    </View>
  );
}
