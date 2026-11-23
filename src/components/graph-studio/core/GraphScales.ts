/**
 * FocusFlow & Finance — Graph Studio Core Mathematical Scales
 * Zero external dependencies. Pure, deterministic coordinate mapping.
 */

export interface LinearScaleOptions {
  clamp?: boolean;
}

/**
 * Maps a continuous numerical domain [min, max] to a coordinate range [yStart, yEnd].
 */
export function scaleLinear(
  value: number,
  domain: [number, number],
  range: [number, number],
  options: LinearScaleOptions = { clamp: true }
): number {
  const [d0, d1] = domain;
  const [r0, r1] = range;

  if (d1 === d0) {
    return (r0 + r1) / 2;
  }

  let normalized = (value - d0) / (d1 - d0);
  if (options.clamp) {
    normalized = Math.max(0, Math.min(1, normalized));
  }

  return r0 + normalized * (r1 - r0);
}

/**
 * Inverse linear scale: maps a coordinate back to the domain value.
 */
export function invertLinear(
  coord: number,
  domain: [number, number],
  range: [number, number]
): number {
  const [d0, d1] = domain;
  const [r0, r1] = range;

  if (r1 === r0) return d0;
  const normalized = (coord - r0) / (r1 - r0);
  return d0 + normalized * (d1 - d0);
}

/**
 * Discrete band scale for histograms and bar charts.
 */
export interface BandScale {
  (item: string): number;
  bandwidth: number;
  step: number;
}

export function scaleBand(
  domain: string[],
  range: [number, number],
  padding = 0.2
): BandScale {
  const [r0, r1] = range;
  const rangeLength = Math.abs(r1 - r0);
  const n = domain.length;

  if (n === 0) {
    const emptyScale = ((() => 0) as unknown) as BandScale;
    emptyScale.bandwidth = 0;
    emptyScale.step = 0;
    return emptyScale;
  }

  const step = rangeLength / (n + padding);
  const bandwidth = step * (1 - padding);
  const startOffset = Math.min(r0, r1) + (step * padding) / 2;

  const domainMap = new Map<string, number>();
  domain.forEach((d, idx) => {
    domainMap.set(d, startOffset + idx * step);
  });

  const scaleFn = ((item: string) => {
    return domainMap.get(item) ?? startOffset;
  }) as BandScale;

  scaleFn.bandwidth = bandwidth;
  scaleFn.step = step;

  return scaleFn;
}

/**
 * Generates human-friendly axis ticks between min and max.
 */
export function getNiceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    return [min];
  }

  if (min > max) {
    [min, max] = [max, min];
  }

  const span = max - min;
  if (span <= 0) return [min];

  const rawStep = span / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;

  let stepMultiplier: number;
  if (residual < 1.5) stepMultiplier = 1;
  else if (residual < 3) stepMultiplier = 2;
  else if (residual < 7) stepMultiplier = 5;
  else stepMultiplier = 10;

  const step = stepMultiplier * magnitude;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  for (let current = start; current <= end + step * 0.001; current += step) {
    ticks.push(Number(current.toFixed(4)));
  }

  return ticks;
}

/**
 * Format numbers for clean axis labels (e.g. 1.5k, 2M, 500).
 */
export function formatCompactNumber(num: number): string {
  if (!Number.isFinite(num)) return '0';
  const abs = Math.abs(num);

  if (abs >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  }
  if (abs >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (abs >= 1_000) {
    return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(Math.round(num * 10) / 10);
}
