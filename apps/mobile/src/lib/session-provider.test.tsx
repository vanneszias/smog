import AsyncStorage from "@react-native-async-storage/async-storage";
import { render, screen, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { Text } from "react-native";
import { SessionProvider, signOut, useSession } from "./session";

jest.mock("expo-secure-store");

/**
 * `SessionProvider`/`useSession`'s own test. Without this, a screen mounted
 * once and left alone would never notice `signOut` called from elsewhere in
 * the tree — a staleness bug every screen that reads the session would hit.
 */
function Probe() {
  const { loading, user } = useSession();

  if (loading) {
    return <Text testID="user">loading</Text>;
  }

  return <Text testID="user">{user ? user.id : "none"}</Text>;
}

const json = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })
  );

describe("SessionProvider", () => {
  beforeEach(() => jest.resetAllMocks());

  it("observes a signOut() called from outside a mounted consumer", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("1");
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce("t") // the provider's own initial load
      .mockResolvedValueOnce("t") // signOut's payloadFetch("/users/logout", { auth: true })
      .mockResolvedValue(null); // the reload signOut's clearToken triggers

    global.fetch = jest.fn(() =>
      json({ user: { email: "a@b.test", id: "1", role: "user" } })
    ) as unknown as typeof fetch;

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("1");
    });

    (global.fetch as unknown as jest.Mock).mockImplementationOnce(() =>
      json({ message: "ok" })
    );

    await signOut();

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("none");
    });
  });
});
