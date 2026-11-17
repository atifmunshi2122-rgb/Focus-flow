/**
 * Network Quality and Connectivity Intelligence
 * Detects effective connection speeds, Save-Data headers, and verifies real server reachability.
 */

export interface NetworkConnectionInfo {
  effectiveType: 'slow-2g' | '2g' | '3g' | '4g' | 'unknown';
  downlink: number | null; // in Mbps
  rtt: number | null; // in ms
  saveData: boolean;
  isConstrained: boolean; // True under 2G, 3G, high latency or data-saver mode
}

interface NetworkInformation extends EventTarget {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

function getNetworkInformation(): NetworkInformation | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  };
  return nav.connection || nav.mozConnection || nav.webkitConnection || null;
}

export function getNetworkConnectionInfo(): NetworkConnectionInfo {
  const info = getNetworkInformation();
  if (!info) {
    return {
      effectiveType: 'unknown',
      downlink: null,
      rtt: null,
      saveData: false,
      isConstrained: false,
    };
  }

  const effectiveTypeRaw = String(info.effectiveType || '').toLowerCase();
  let effectiveType: NetworkConnectionInfo['effectiveType'] = 'unknown';
  if (effectiveTypeRaw.includes('2g')) {
    effectiveType = effectiveTypeRaw.includes('slow') ? 'slow-2g' : '2g';
  } else if (effectiveTypeRaw.includes('3g')) {
    effectiveType = '3g';
  } else if (effectiveTypeRaw.includes('4g')) {
    effectiveType = '4g';
  }

  const downlink = typeof info.downlink === 'number' && Number.isFinite(info.downlink) ? info.downlink : null;
  const rtt = typeof info.rtt === 'number' && Number.isFinite(info.rtt) ? info.rtt : null;
  const saveData = Boolean(info.saveData);

  const isConstrained =
    saveData ||
    effectiveType === 'slow-2g' ||
    effectiveType === '2g' ||
    effectiveType === '3g' ||
    (rtt !== null && rtt >= 600) ||
    (downlink !== null && downlink <= 0.8);

  return {
    effectiveType,
    downlink,
    rtt,
    saveData,
    isConstrained,
  };
}

let lastProbeTime = 0;
let lastProbeResult = true;

/**
 * Probes the server health endpoint with a short abortable timeout.
 * Reuses results within a 10-second debounce window to avoid traffic spam.
 */
export async function probeServerConnectivity(force = false): Promise<boolean> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return true;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    lastProbeResult = false;
    lastProbeTime = Date.now();
    return false;
  }

  const now = Date.now();
  if (!force && now - lastProbeTime < 10000) {
    return lastProbeResult;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = setTimeout(() => {
    controller?.abort();
  }, 4000);

  try {
    const res = await fetch('/api/health', {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache, no-store' },
      signal: controller?.signal,
    });
    lastProbeResult = res.ok || res.status === 404; // 404 still means server is reachable
    lastProbeTime = Date.now();
    return lastProbeResult;
  } catch {
    lastProbeResult = false;
    lastProbeTime = Date.now();
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

