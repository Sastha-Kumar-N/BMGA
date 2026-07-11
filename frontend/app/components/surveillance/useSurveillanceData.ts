'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { apiPath } from '../../lib/api-client';
import {
  EMPTY_SURVEILLANCE_FILTERS,
  surveillanceQuery,
  type AmrInsightsResponse,
  type SurveillanceFilterOptions,
  type SurveillanceFilterState,
  type SurveillanceOverview,
  type SurveillanceRecordsResponse,
  type SurveillanceView,
} from './types';

const EMPTY_OPTIONS: SurveillanceFilterOptions = {
  organisms: [],
  countries: [],
  sources: [],
  evidenceBasis: ['GENOTYPIC', 'PHENOTYPIC', 'COMBINED', 'NOT_REPORTED'],
  scopes: ['NATIONAL', 'GLOBAL'],
};

async function jsonRequest<T>(path: string, signal: AbortSignal) {
  const response = await fetch(apiPath(path), { cache: 'no-store', signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed with status ${response.status}`);
  return payload as T;
}

export function useSurveillanceData(view: SurveillanceView) {
  const [filters, setFilters] = useState<SurveillanceFilterState>(EMPTY_SURVEILLANCE_FILTERS);
  const [options, setOptions] = useState<SurveillanceFilterOptions>(EMPTY_OPTIONS);
  const [overview, setOverview] = useState<SurveillanceOverview | null>(null);
  const [records, setRecords] = useState<SurveillanceRecordsResponse | null>(null);
  const [amr, setAmr] = useState<AmrInsightsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(view === 'records' ? 25 : 15);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const deferredSearch = useDeferredValue(filters.search);
  const effectiveFilters = useMemo(() => ({ ...filters, search: deferredSearch }), [deferredSearch, filters]);

  useEffect(() => {
    const controller = new AbortController();
    void jsonRequest<SurveillanceFilterOptions>('/surveillance/filters', controller.signal)
      .then(setOptions)
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        console.error('Surveillance filter options failed', requestError);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let hasLoaded = false;

    async function load(background = false) {
      if (background) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const query = surveillanceQuery(effectiveFilters);
        const requests: Array<Promise<unknown>> = [
          jsonRequest<SurveillanceOverview>(`/surveillance/overview${query}`, controller.signal),
        ];
        const needsRecords = view === 'overview' || view === 'records';
        const needsAmr = view === 'overview' || view === 'amr';
        if (needsRecords) {
          requests.push(jsonRequest<SurveillanceRecordsResponse>(
            `/surveillance/records${surveillanceQuery(effectiveFilters, page, pageSize)}`,
            controller.signal,
          ));
        }
        if (needsAmr) requests.push(jsonRequest<AmrInsightsResponse>(`/surveillance/amr${query}`, controller.signal));

        const responses = await Promise.all(requests);
        if (!active) return;
        setOverview(responses[0] as SurveillanceOverview);
        let responseIndex = 1;
        if (needsRecords) setRecords(responses[responseIndex++] as SurveillanceRecordsResponse);
        if (needsAmr) setAmr(responses[responseIndex] as AmrInsightsResponse);
        hasLoaded = true;
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load surveillance data.');
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void load(false);
    const interval = window.setInterval(() => void load(hasLoaded), 60_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [effectiveFilters, page, pageSize, refreshVersion, view]);

  const updateFilter = (key: keyof SurveillanceFilterState, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(EMPTY_SURVEILLANCE_FILTERS);
    setPage(1);
  };

  return {
    filters,
    options,
    overview,
    records,
    amr,
    page,
    pageSize,
    loading,
    refreshing,
    error,
    updateFilter,
    resetFilters,
    setPage,
    setPageSize: (value: number) => {
      setPageSize(value);
      setPage(1);
    },
    refresh: () => setRefreshVersion((value) => value + 1),
  };
}
