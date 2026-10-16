// SPM-13 — reading a venue's free-text operating hours and checking an event against them, in Singapore
// time (UTC+8, no daylight saving; the customer works in Singapore only).
//
// Operating hours are free text (SPM-6), so this reads only common forms such as
// "Monday-Friday 09:00-18:00", "Mon–Sat 8am–8pm", "Daily 08:00-22:00", "Weekdays 9:00-17:00, Saturday
// 9:00-13:00" and "24/7". Anything else, including extra words like "except public holidays", is
// unreadable rather than guessed at (team decision B1, 15 Oct 2026).

const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const MINUTES_PER_DAY = 24 * 60

const ALL_DAYS = Object.freeze([0, 1, 2, 3, 4, 5, 6])
const WEEKDAY_NAMES = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
const MONTH_NAMES = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])

const DAY_PATTERN = 'mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?'
const DAYS_PATTERN = `daily|every\\s*day|weekdays|weekends|(?:${DAY_PATTERN})(?:\\s*-\\s*(?:${DAY_PATTERN}))?`
const TIME_PATTERN = '(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?'
const SEGMENT = new RegExp(`(${DAYS_PATTERN})\\s*:?\\s*${TIME_PATTERN}\\s*-\\s*${TIME_PATTERN}`, 'g')
const ALWAYS_OPEN = /^(?:open\s+)?(?:24\/7|24\s*hours?(?:\s*(?:daily|a\s*day|every\s*day))?)$/

function dayIndex(word) {
  const prefix = word.slice(0, 3)
  return { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }[prefix]
}

function parseDays(text) {
  const days = text.replace(/\s+/g, ' ')
  if (days === 'daily' || /^every\s?day$/.test(days)) return ALL_DAYS
  if (days === 'weekdays') return [1, 2, 3, 4, 5]
  if (days === 'weekends') return [6, 0]

  const [from, to] = days.split('-').map((part) => dayIndex(part.trim()))
  if (to === undefined) return [from]
  const range = [from]
  for (let day = from; day !== to; ) {
    day = (day + 1) % 7
    range.push(day)
  }
  return range
}

// Minutes after midnight, or null if the time is not a real time. 24:00 is allowed as a closing time.
function parseTime(hourText, minuteText, meridiem) {
  let hour = Number(hourText)
  const minute = minuteText === undefined ? 0 : Number(minuteText)
  if (minute > 59) return null
  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    if (meridiem === 'am' && hour === 12) hour = 0
    if (meridiem === 'pm' && hour !== 12) hour += 12
  }
  if (hour > 24 || (hour === 24 && minute > 0)) return null
  return hour * 60 + minute
}

/**
 * The opening segments in `text` — [{ days: [0..6], opens, closes }] with minutes after midnight — or
 * null when the text cannot be read with confidence. Sunday is 0.
 */
export function parseOperatingHours(text) {
  if (typeof text !== 'string') return null
  const normalised = text
    .toLowerCase()
    .replace(/[‒-―]/g, '-')
    .replace(/\s+to\s+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalised) return null
  if (ALWAYS_OPEN.test(normalised)) return [{ days: ALL_DAYS, opens: 0, closes: MINUTES_PER_DAY }]

  const segments = []
  let leftover = normalised
  for (const match of normalised.matchAll(SEGMENT)) {
    const [whole, days, openHour, openMinute, openMeridiem, closeHour, closeMinute, closeMeridiem] = match
    const opens = parseTime(openHour, openMinute, openMeridiem)
    const closes = parseTime(closeHour, closeMinute, closeMeridiem)
    // Hours that run past midnight ("18:00-02:00") are not read; the venue gets the unreadable warning.
    if (opens === null || closes === null || opens >= closes || opens === MINUTES_PER_DAY) return null
    segments.push({ days: parseDays(days), opens, closes })
    leftover = leftover.replace(whole, ' ')
  }

  // Only separators may be left over; any other word means the text says something not understood.
  if (segments.length === 0 || /[a-z0-9]/.test(leftover.replace(/\band\b/g, ''))) return null
  return segments
}

function singaporeDayStart(time) {
  return Math.floor((time + SINGAPORE_OFFSET_MS) / DAY_MS) * DAY_MS - SINGAPORE_OFFSET_MS
}

/**
 * 'within', 'outside' or 'unreadable': whether the whole period from startsAt to endsAt falls inside the
 * venue's operating hours. A period crossing midnight must be covered on each day it touches.
 */
export function operatingHoursCheck(text, { startsAt, endsAt }) {
  const segments = parseOperatingHours(text)
  if (!segments) return 'unreadable'

  const end = Date.parse(endsAt)
  let cursor = Date.parse(startsAt)
  while (cursor < end) {
    const dayStart = singaporeDayStart(cursor)
    const portionEnd = Math.min(end, dayStart + DAY_MS)
    const weekday = new Date(dayStart + SINGAPORE_OFFSET_MS).getUTCDay()
    const from = (cursor - dayStart) / MINUTE_MS
    const to = (portionEnd - dayStart) / MINUTE_MS
    const covered = segments.some((segment) => segment.days.includes(weekday) && segment.opens <= from && segment.closes >= to)
    if (!covered) return 'outside'
    cursor = portionEnd
  }
  return 'within'
}

function singaporeParts(time) {
  const local = new Date(time + SINGAPORE_OFFSET_MS)
  const pad = (number) => String(number).padStart(2, '0')
  return {
    date: `${WEEKDAY_NAMES[local.getUTCDay()]} ${local.getUTCDate()} ${MONTH_NAMES[local.getUTCMonth()]} ${local.getUTCFullYear()}`,
    time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
  }
}

/** "Fri 20 Nov 2026, 09:00–13:00" in Singapore time; both dates when the period crosses midnight. */
export function formatSingaporePeriod(startsAt, endsAt) {
  const start = singaporeParts(Date.parse(startsAt))
  const end = singaporeParts(Date.parse(endsAt))
  if (start.date === end.date) return `${start.date}, ${start.time}–${end.time}`
  return `${start.date}, ${start.time} – ${end.date}, ${end.time}`
}
