import { useQuery } from "@tanstack/react-query";
import { categoriesOptions } from "./options";
import { useGesturesRpc } from "./slice";

/** Published categories in menu order, with their gesture counts. */
export function useCategories() {
  return useQuery(categoriesOptions(useGesturesRpc()));
}
