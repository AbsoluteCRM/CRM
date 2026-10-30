import { describe, expect, test } from 'vitest'

import { DEFAULT_BUSINESS_HOURS } from '#/integrations/settings/schema'
import { awayOn, dayState, monthDay } from './availability-utils'
import type { TimeOff } from '#/integrations/teams/availability'

const member = { id: 'm1', work_days: [1, 2, 3, 4, 5] }

const off = (
  start_date: string,
  end_date: string,
  over: Partial<TimeOff> = {},
): TimeOff => ({
  id: `${start_date}-${end_date}`,
  member_id: 'm1',
  kind: 'sick',
  start_date,
  end_date,
  note: null,
  status: 'approved',
  requested_by_member_id: null,
  reviewed_by_member_id: null,
  reviewed_at: null,
  review_note: null,
  created_at: '2026-10-01T00:00:00Z',
  ...over,
})

// 2026-11-02 is a Monday.
describe('awayOn', () => {
  test('returns the next work day after the time off', () => {
    expect(
      awayOn(member, '2026-11-03', DEFAULT_BUSINESS_HOURS, [
        off('2026-11-02', '2026-11-04'),
      ]),
    ).toEqual({ kind: 'sick', returns: '2026-11-05' })
  })

  test('skips the weekend when the member does not work it', () => {
    expect(
      awayOn(member, '2026-11-06', DEFAULT_BUSINESS_HOURS, [
        off('2026-11-05', '2026-11-06', { kind: 'vacation' }),
      ]),
    ).toEqual({ kind: 'vacation', returns: '2026-11-09' })
  })

  test('follows back-to-back time off', () => {
    expect(
      awayOn(member, '2026-11-02', DEFAULT_BUSINESS_HOURS, [
        off('2026-11-02', '2026-11-03'),
        off('2026-11-04', '2026-11-05', { kind: 'personal' }),
      ]),
    ).toEqual({ kind: 'sick', returns: '2026-11-06' })
  })

  test('skips days the business is closed', () => {
    const hours = {
      ...DEFAULT_BUSINESS_HOURS,
      mon: { ...DEFAULT_BUSINESS_HOURS.mon, closed: true },
    }
    expect(
      awayOn(member, '2026-11-06', hours, [off('2026-11-06', '2026-11-06')]),
    ).toEqual({ kind: 'sick', returns: '2026-11-10' })
  })

  test('ignores pending requests, other members, and other days', () => {
    expect(
      awayOn(member, '2026-11-03', DEFAULT_BUSINESS_HOURS, [
        off('2026-11-03', '2026-11-03', { status: 'pending' }),
        off('2026-11-03', '2026-11-03', { member_id: 'm2' }),
        off('2026-11-05', '2026-11-06'),
      ]),
    ).toBeNull()
  })
})

test('monthDay formats MM/DD', () => {
  expect(monthDay('2026-11-05')).toBe('11/05')
})

test('a recorded day off shows as a day off and counts as away', () => {
  const dayOff = [off('2026-11-04', '2026-11-04', { kind: 'day_off' })]
  expect(dayState(member, '2026-11-04', DEFAULT_BUSINESS_HOURS, dayOff)).toBe(
    'off_day',
  )
  expect(awayOn(member, '2026-11-04', DEFAULT_BUSINESS_HOURS, dayOff)).toEqual({
    kind: 'day_off',
    returns: '2026-11-05',
  })
})
