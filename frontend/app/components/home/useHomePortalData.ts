'use client';

import { useEffect, useState } from 'react';
import { apiPath } from '../../lib/api-client';
import type {
  AmrInsightsResponse,
  SurveillanceOverview,
  SurveillanceRecordsResponse,
} from '../surveillance/types';
import {
  EMPTY_HOME_PORTAL_DATA,
  type HomePortalData,
  type HomeStrain,
} from './types';

const HOME_REFRESH_INTERVAL_MS = 60_000;

async function requestJson<T>(path: string, signal: AbortSignal) {
  const response = await fetch(apiPath(path), { cache: 'no-store', signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}`);
  }
  return payload as T;
}

export function useHomePortalData() {
  const [data, setData] = useState<HomePortalData>(EMPTY_HOME_PORTAL_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let currentController: AbortController | null = null;
    let hasLoaded = false;

    async function load() {
      currentController?.abort();
      const controller = new AbortController();
      currentController = controller;
      if (hasLoaded) setRefreshing(true);
      else setLoading(true);

      const requests = await Promise.allSettled([
        requestJson<HomeStrain[]>('/strains', controller.signal),
        requestJson<SurveillanceOverview>('/surveillance/overview', controller.signal),
        requestJson<SurveillanceRecordsResponse>('/surveillance/records?page=1&pageSize=8', controller.signal),
        requestJson<AmrInsightsResponse>('/surveillance/amr', controller.signal),
      ]);

      if (!active || controller.signal.aborted) return;

      const failures = requests.filter((result) => result.status === 'rejected');
      setData((current) => ({
        strains: requests[0].status === 'fulfilled' ? requests[0].value : current.strains,
        overview: requests[1].status === 'fulfilled' ? requests[1].value : current.overview,
        records: requests[2].status === 'fulfilled' ? requests[2].value : current.records,
        amr: requests[3].status === 'fulfilled' ? requests[3].value : current.amr,
      }));
      setError(failures.length ? 'Some live portal data is temporarily unavailable.' : null);
      hasLoaded = true;
      setLoading(false);
      setRefreshing(false);
    }

    void load();
    const interval = window.setInterval(() => void load(), HOME_REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      currentController?.abort();
      window.clearInterval(interval);
    };
  }, []);

  return { data, loading, refreshing, error };
}
