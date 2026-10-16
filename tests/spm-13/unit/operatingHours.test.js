// SPM-13 AC1/AC2 — reading a venue's free-text operating hours and checking an event against them, in
// Singapore time (team decision B1).

import { describe, expect, it } from 'vitest'

import { formatSingaporePeriod, operatingHoursCheck, parseOperatingHours } from '../../../shared/operatingHours.js'

const WEEKDAYS = [1, 2, 3, 4, 5]
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

// Friday 20 November 2026, Singapore time.
const fridayMorning = { startsAt: '2026-11-20T09:00:00+08:00', endsAt: '2026-11-20T13:00:00+08:00' }
const fridayEvening = { startsAt: '2026-11-20T17:00:00+08:00', endsAt: '2026-11-20T19:00:00+08:00' }
const saturdayMorning = { startsAt: '2026-11-21T10:00:00+08:00', endsAt: '2026-11-21T12:00:00+08:00' }

describe('SPM-13 — operating hours (unit)', () => {
  it.each([
    ['Monday-Friday 09:00-18:00', [{ days: WEEKDAYS, opens: 540, closes: 1080 }]],
    ['Mon–Sat 8am–8pm', [{ days: [1, 2, 3, 4, 5, 6], opens: 480, closes: 1200 }]],
    ['Daily 08:00-22:00', [{ days: EVERY_DAY, opens: 480, closes: 1320 }]],
    ['Mon-Fri: 9:00 to 17:00', [{ days: WEEKDAYS, opens: 540, closes: 1020 }]],
    ['Fri-Mon 10:00-16:00', [{ days: [5, 6, 0, 1], opens: 600, closes: 960 }]],
    ['24/7', [{ days: EVERY_DAY, opens: 0, closes: 1440 }]],
    [
      'Weekdays 9:00-17:00, Saturday 9:00-13:00',
      [
        { days: WEEKDAYS, opens: 540, closes: 1020 },
        { days: [6], opens: 540, closes: 780 },
      ],
    ],
  ])('spm13_reads_%j', (text, expected) => {
    expect(parseOperatingHours(text)).toEqual(expected)
  })

  it.each(['By appointment', 'Monday-Friday 09:00-18:00 except public holidays', 'Daily 18:00-02:00', 'Mon-Fri 25:00-26:00', '', null])(
    'spm13_does_not_guess_at_%j',
    (text) => {
      expect(parseOperatingHours(text)).toBeNull()
    },
  )

  it('spm13_an_event_inside_the_hours_is_within_them', () => {
    expect(operatingHoursCheck('Monday-Friday 09:00-18:00', fridayMorning)).toBe('within')
    expect(operatingHoursCheck('24/7', fridayEvening)).toBe('within')
  })

  it('spm13_an_event_running_past_closing_or_on_a_closed_day_is_outside_them', () => {
    expect(operatingHoursCheck('Monday-Friday 09:00-18:00', fridayEvening)).toBe('outside')
    expect(operatingHoursCheck('Monday-Friday 09:00-18:00', saturdayMorning)).toBe('outside')
  })

  it('spm13_an_event_crossing_midnight_must_be_covered_on_both_days', () => {
    const lateNight = { startsAt: '2026-11-20T22:00:00+08:00', endsAt: '2026-11-21T01:00:00+08:00' }

    expect(operatingHoursCheck('Daily 08:00-24:00', lateNight)).toBe('outside')
    expect(operatingHoursCheck('24/7', lateNight)).toBe('within')
  })

  it('spm13_unreadable_hours_are_reported_as_such', () => {
    expect(operatingHoursCheck('By appointment', fridayMorning)).toBe('unreadable')
  })

  it('spm13_formats_periods_in_singapore_time', () => {
    expect(formatSingaporePeriod(fridayMorning.startsAt, fridayMorning.endsAt)).toBe('Fri 20 Nov 2026, 09:00–13:00')
    expect(formatSingaporePeriod('2026-11-20T14:00:00.000Z', '2026-11-20T17:00:00.000Z')).toBe('Fri 20 Nov 2026, 22:00 – Sat 21 Nov 2026, 01:00')
  })
})
