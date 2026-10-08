// Map a timeline bucket label back to the real epoch span it covers.
//
// The server formats buckets with the viewer's tzModifier (the same offset the
// page sends as `tzOffset`, minutes east of UTC), so the label is viewer
// wall-clock dressed up as an ISO string. Anchoring the label at UTC and then
// subtracting the offset recovers the true epoch of the bucket start — no
// dependence on the browser's own zone beyond the offset it reported.
export function hourRangeFromBucket(timestamp: string, tzOffsetMinutes: number): { start: number; span: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}))?/.exec(timestamp);
  if (!match) return null;
  const [, y, mo, d, hh] = match;
  const anchor = hh !== undefined ? Date.UTC(+y, +mo - 1, +d, +hh) : Date.UTC(+y, +mo - 1, +d);
  return { start: anchor - tzOffsetMinutes * 60_000, span: hh !== undefined ? 3_600_000 : 86_400_000 };
}
