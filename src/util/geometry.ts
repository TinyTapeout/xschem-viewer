import { type Wire } from '~/xschem-parser';

export interface Point {
  x: number;
  y: number;
}

/** Checks if a given point is in the middle of the wire, but not touching the edges */
export function isPointInsideWire(point: Point, wire: Wire) {
  if (
    (point.x === wire.x1 && point.y === wire.y1) ||
    (point.x === wire.x2 && point.y === wire.y2)
  ) {
    return false;
  }

  return pointToLineDistance(point, wire.x1, wire.y1, wire.x2, wire.y2) < 0.01;
}

/** Calculates the distance from a point to a line segment */
function pointToLineDistance(point: Point, x1: number, y1: number, x2: number, y2: number): number {
  const A = point.x - x1;
  const B = point.y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSquared = C * C + D * D;
  let param = -1;
  if (lenSquared !== 0) {
    // in case of zero length line
    param = dot / lenSquared;
  }

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = point.x - xx;
  const dy = point.y - yy;
  return Math.sqrt(dx * dx + dy * dy);
}
