import type { ScanResult } from '../../types';

/**
 * Short-lived handoff between the scan flow and the result route.
 *
 * Phase 6 will replace this with persisted scan history. Keeping it separate
 * means the UI does not depend on whether the scan service is mock or real.
 */
let latestScanResult: ScanResult | null = null;

export const setLatestScanResult = (result: ScanResult) => {
  latestScanResult = result;
};

export const getLatestScanResult = () => latestScanResult;
export const clearLatestScanResult = () => { latestScanResult = null; };
