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
  searchQuery: string;
  statusFilter: string;
  dateFrom: string;
  dateTo: string;
}

export interface UseAdminFiltersReturn {
  filters: AdminFilters;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  dateFrom: string;
  setDateFrom: (date: string) => void;
  dateTo: string;
  setDateTo: (date: string) => void;
  /** Reset all filters to their default (empty) values. */
  clearFilters: () => void;
  /** Returns `true` if any filter is currently active. */
  hasActiveFilters: boolean;
}

const DEFAULT_FILTERS: AdminFilters = {
  searchQuery: "",
  statusFilter: "",
  dateFrom: "",
  dateTo: "",
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
    filters,
    searchQuery: filters.searchQuery,
    setSearchQuery,
    statusFilter: filters.statusFilter,
    setStatusFilter,
    dateFrom: filters.dateFrom,
    setDateFrom,
    dateTo: filters.dateTo,
    setDateTo,
    clearFilters,
    hasActiveFilters,
  };
}
