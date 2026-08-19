export interface FloorplanPoint { x: number; y: number }

const GEOMETRY_EPSILON = 0.0001;

export const polygonArea = (polygon: FloorplanPoint[]) => Math.abs(polygon.reduce((sum, point, index) => {
  const next = polygon[(index + 1) % polygon.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0)) / 2;

const lineSide = (point: FloorplanPoint, start: FloorplanPoint, end: FloorplanPoint) => (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);

const intersectLine = (from: FloorplanPoint, to: FloorplanPoint, lineStart: FloorplanPoint, lineEnd: FloorplanPoint): FloorplanPoint => {
  const fromSide = lineSide(from, lineStart, lineEnd);
  const toSide = lineSide(to, lineStart, lineEnd);
  const ratio = fromSide / (fromSide - toSide);
  return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
};

const dedupePolygon = (polygon: FloorplanPoint[]) => polygon.filter((point, index) => {
  const previous = polygon[(index + polygon.length - 1) % polygon.length];
  return Math.hypot(point.x - previous.x, point.y - previous.y) > GEOMETRY_EPSILON;
});

const clipPolygonToLine = (polygon: FloorplanPoint[], lineStart: FloorplanPoint, lineEnd: FloorplanPoint, keepPositive: boolean) => {
  const output: FloorplanPoint[] = [];
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const pointSide = lineSide(point, lineStart, lineEnd);
    const nextSide = lineSide(next, lineStart, lineEnd);
    const pointInside = keepPositive ? pointSide >= -GEOMETRY_EPSILON : pointSide <= GEOMETRY_EPSILON;
    const nextInside = keepPositive ? nextSide >= -GEOMETRY_EPSILON : nextSide <= GEOMETRY_EPSILON;
    if (pointInside) output.push(point);
    if (pointInside !== nextInside) output.push(intersectLine(point, next, lineStart, lineEnd));
  });
  return dedupePolygon(output);
};

export const splitPolygon = (polygon: FloorplanPoint[], lineStart: FloorplanPoint, lineEnd: FloorplanPoint) => [
  clipPolygonToLine(polygon, lineStart, lineEnd, true),
  clipPolygonToLine(polygon, lineStart, lineEnd, false),
];

export const countLineCrossings = (polygon: FloorplanPoint[], lineStart: FloorplanPoint, lineEnd: FloorplanPoint) => {
  const signs = polygon.map((point) => {
    const side = lineSide(point, lineStart, lineEnd);
    return Math.abs(side) <= GEOMETRY_EPSILON ? 0 : Math.sign(side);
  }).filter((sign) => sign !== 0);
  if (signs.length < 2) return 0;
  return signs.reduce((count, sign, index) => count + (sign !== signs[(index + 1) % signs.length] ? 1 : 0), 0);
};

const segmentsIntersect = (a: FloorplanPoint, b: FloorplanPoint, c: FloorplanPoint, d: FloorplanPoint) => {
  const abC = lineSide(c, a, b);
  const abD = lineSide(d, a, b);
  const cdA = lineSide(a, c, d);
  const cdB = lineSide(b, c, d);
  return abC * abD < -GEOMETRY_EPSILON && cdA * cdB < -GEOMETRY_EPSILON;
};

export const hasSelfIntersection = (polygon: FloorplanPoint[]) => polygon.some((start, index) => {
  const end = polygon[(index + 1) % polygon.length];
  return polygon.some((otherStart, otherIndex) => {
    if (index === otherIndex || (index + 1) % polygon.length === otherIndex || index === (otherIndex + 1) % polygon.length) return false;
    return segmentsIntersect(start, end, otherStart, polygon[(otherIndex + 1) % polygon.length]);
  });
});
