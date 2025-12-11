import AsyncStorage from "@react-native-async-storage/async-storage";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type RecentSearchesContextType = {
  recentSearches: string[];
  addRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
  // Removed setOnSelect and onSelect for prop-based handler pattern
};

const RecentSearchesContext = createContext<RecentSearchesContextType>({
  recentSearches: [],
  addRecentSearch: () => {},
  clearRecentSearches: () => {},
  // Removed setOnSelect and onSelect for prop-based handler pattern
});

export const useRecentSearches = () => useContext(RecentSearchesContext);

type RecentSearchesProviderProps = {
  children: React.ReactNode;
  maxSearches?: number;
};

/**
 * Provides global recent search state and handlers.
 * Stores recent searches in AsyncStorage for persistence.
 */
export const RecentSearchesProvider: React.FC<RecentSearchesProviderProps> = ({
  children,
  maxSearches = 10,
}) => {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  // Removed onSelectHandler and setOnSelectHandler for prop-based handler pattern

  useEffect(() => {
    AsyncStorage.getItem("recentSearches").then((saved) => {
      if (saved) {
        setRecentSearches(JSON.parse(saved));
      }
    });
  }, []);

  const saveSearches = useCallback(async (searches: string[]) => {
    await AsyncStorage.setItem("recentSearches", JSON.stringify(searches));
  }, []);

  const addRecentSearch = useCallback(
    (query: string) => {
      setRecentSearches((prev) => {
        const filtered = prev.filter((q) => q !== query);
        const updated = [query, ...filtered].slice(0, maxSearches);
        saveSearches(updated);
        return updated;
      });
    },
    [maxSearches, saveSearches]
  );

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    AsyncStorage.removeItem("recentSearches");
  }, []);

  // Removed setOnSelect and onSelect for prop-based handler pattern

  return (
    <RecentSearchesContext.Provider
      value={{
        recentSearches,
        addRecentSearch,
        clearRecentSearches,
        // Removed setOnSelect and onSelect for prop-based handler pattern
      }}
    >
      {children}
    </RecentSearchesContext.Provider>
  );
};

export default RecentSearchesProvider;
