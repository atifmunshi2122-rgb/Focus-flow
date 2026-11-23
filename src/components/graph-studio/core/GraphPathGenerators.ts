/**
 * FocusFlow & Finance — Graph Studio SVG Path & Spline Generators
 * Produces aesthetic Catmull-Rom / cubic Bezier curves and closed area paths.
 */

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Generates an SVG path data string using Catmull-Rom spline interpolation.
 * Produces smooth aesthetic curves without sharp angular transitions.
 */
export function generateSmoothSplinePath(points: Point2D[], tension = 0.3): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i === 0 ? points[0] : points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < points.length ? points[i + 2] : p2;

    const cp1x = p1.x + ((p2.x - p0.x) / 6) * (1 - tension + 0.3);
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * (1 - tension + 0.3);

    const cp2x = p2.x - ((p3.x - p1.x) / 6) * (1 - tension + 0.3);
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * (1 - tension + 0.3);

    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  return path;
}

/**
 * Creates a closed SVG path for gradient area fills under a smooth curve.
 */
export function generateAreaPath(points: Point2D[], baselineY: number, tension = 0.3): string {
  if (points.length < 2) return '';

  const spline = generateSmoothSplinePath(points, tension);
  const first = points[0];
  const last = points[points.length - 1];

  return `${spline} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
}

/**
 * Creates an orthogonal stepped path (e.g., for burndown charts and balance transitions).
 */
export function generateStepPath(points: Point2D[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    path += ` L ${curr.x.toFixed(2)} ${prev.y.toFixed(2)} L ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
  }
  return path;
}

/**
 * Generates an SVG path for a circular ring sector or arc.
 */
export function describeArc(
  x: number,
  y: number,
  radius: number,
  startAngleDeg: number,
  endAngleDeg: number
): string {
  const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: cx + r * Math.cos(angleInRadians),
      y: cy + r * Math.sin(angleInRadians),
    };
  };

  const start = polarToCartesian(x, y, radius, endAngleDeg);
  const end = polarToCartesian(x, y, radius, startAngleDeg);
  const largeArcFlag = endAngleDeg - startAngleDeg <= 180 ? '0' : '1';

  return [
    'M', start.x.toFixed(2), start.y.toFixed(2),
    'A', radius.toFixed(2), radius.toFixed(2), 0, largeArcFlag, 0, end.x.toFixed(2), end.y.toFixed(2),
  ].join(' ');
}
