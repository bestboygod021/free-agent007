import { describe, expect, it } from 'vitest'
import { hourRangeFromBucket } from './timeline-marker'

// The analytics overlay hands the operator's click back to the Keys list; the
// label→epoch math must survive any browser zone and both bucket formats.
describe('hourRangeFromBucket', () => {
  it('maps an hourly label back through the viewer offset to the true epoch', () => {
    // Label is viewer wall-clock (server applied tzOffset=+540 minutes east).
    const hourLabel = '2026-10-08T14:00:00'
    const utcAnchor = Date.UTC(2026, 9, 8, 14)
    expect(hourRangeFromBucket(hourLabel, 540)).toEqual({ start: utcAnchor - 540 * 60_000, span: 3_600_000 })
    // Zero offset → the label IS the epoch hour.
    expect(hourRangeFromBucket(hourLabel, 0)).toEqual({ start: utcAnchor, span: 3_600_000 })
    // Negative offsets (west) shift the other way.
    expect(hourRangeFromBucket(hourLabel, -480)).toEqual({ start: utcAnchor + 480 * 60_000, span: 3_600_000 })
  })

  it('maps day buckets to a 24h span', () => {
    const dayLabel = '2026-10-08'
    expect(hourRangeFromBucket(dayLabel, 0)).toEqual({ start: Date.UTC(2026, 9, 8), span: 86_400_000 })
  })

  it('tolerates a trailing Z and rejects garbage', () => {
    expect(hourRangeFromBucket('2026-10-08T14:00:00Z', 0)?.start).toBe(Date.UTC(2026, 9, 8, 14))
    expect(hourRangeFromBucket('nonsense', 0)).toBeNull()
    expect(hourRangeFromBucket('', 0)).toBeNull()
  })
})
