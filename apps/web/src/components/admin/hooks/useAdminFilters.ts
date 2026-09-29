/**
 * @fileoverview Shared filter state for admin data tables.
 *
 * Provides a single source of truth for all admin filter state so that
 * different admin pages can share the same filter logic without duplication.
 *
 * @example
 * const { searchQuery, setSearchQuery, statusFilter, setStatusFilter, clearFilters } =
 *   useAdminFilters();
 */

import { useCallback, useState } from "react";

interface AdminFilters {
  dateFrom: string;
  dateTo: string;
  searchQuery: string;
  statusFilter: string;
}

export interface UseAdminFiltersReturn {
  /** Reset all filters to their default (empty) values. */
  clearFilters: () => void;
  dateFrom: string;
  dateTo: string;
  filters: AdminFilters;
  /** Returns `true` if any filter is currently active. */
  hasActiveFilters: boolean;
  searchQuery: string;
  setDateFrom: (date: string) => void;
  setDateTo: (date: string) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (status: string) => void;
  statusFilter: string;
}

const DEFAULT_FILTERS: AdminFilters = {
  dateFrom: "",
  dateTo: "",
  searchQuery: "",
  statusFilter: "",
};

/**
 * Manage shared filter state for an admin data table.
 *
 * Returns individual setters for convenience and a `clearFilters` function
 * to reset everything at once.
 */
export function useAdminFilters(): UseAdminFiltersReturn {
  const [filters, setFilters] = useState<AdminFilters>(DEFAULT_FILTERS);

  const setSearchQuery = useCallback((query: string) => {
    setFilters((prev) => ({ ...prev, searchQuery: query }));
  }, []);

  const setStatusFilter = useCallback((status: string) => {
    setFilters((prev) => ({ ...prev, statusFilter: status }));
  }, []);

  const setDateFrom = useCallback((date: string) => {
    setFilters((prev) => ({ ...prev, dateFrom: date }));
  }, []);

  const setDateTo = useCallback((date: string) => {
    setFilters((prev) => ({ ...prev, dateTo: date }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const hasActiveFilters =
    filters.searchQuery !== "" ||
    filters.statusFilter !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  return {
    clearFilters,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    filters,
    hasActiveFilters,
    searchQuery: filters.searchQuery,
    setDateFrom,
    setDateTo,
    setSearchQuery,
    setStatusFilter,
    statusFilter: filters.statusFilter,
  };
}
