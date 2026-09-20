// SPM-42 #7 — a save sends only the fields the user changed, inside sections they may edit.
import { describe, expect, it } from 'vitest'

import { CORE, EQUIPMENT, VENUE } from '../../../shared/permissions.js'
import { buildPatch, hasChanges, toFormValues } from './requestPatch.js'

const request = {
  id: 'req-1',
  status: 'planning',
  core: { title: 'Summit', purpose: 'Partners', description: null, preferredDateTime: null, durationHours: 4, expectedAttendees: 80 },
  venue: { layoutPreference: 'theatre', accessibilityRequired: true, accessibilityNeeds: null },
  equipment: { requirements: ['projector', 'microphone'], technicalSupportNeeded: false },
}

describe('Request patch', () => {
  it('Turns a request into form values a form can hold', () => {
    const form = toFormValues(request)
    expect(form[CORE].durationHours).toBe('4')
    expect(form[VENUE].accessibilityRequired).toBe(true)
    expect(form[EQUIPMENT].requirements).toBe('projector\nmicrophone')
    expect(form[CORE].description).toBe('')
  })

  it('Sends nothing when nothing changed', () => {
    const patch = buildPatch(request, toFormValues(request), [CORE, VENUE, EQUIPMENT])
    expect(hasChanges(patch)).toBe(false)
  })

  it('Sends only the changed field, not the whole section', () => {
    const form = toFormValues(request)
    form[VENUE].layoutPreference = 'banquet'
    expect(buildPatch(request, form, [VENUE])).toEqual({ venue: { layoutPreference: 'banquet' } })
  })

  it('Never sends a section the user may not edit', () => {
    const form = toFormValues(request)
    form[CORE].title = 'Edited by venue staff'
    form[VENUE].layoutPreference = 'banquet'
    expect(buildPatch(request, form, [VENUE])).toEqual({ venue: { layoutPreference: 'banquet' } })
  })

  it('Converts values back to how they are stored', () => {
    const form = toFormValues(request)
    form[CORE].expectedAttendees = '120'
    form[EQUIPMENT].requirements = 'projector\n\n lectern '
    form[EQUIPMENT].technicalSupportNeeded = true
    form[CORE].purpose = ''
    const patch = buildPatch(request, form, [CORE, EQUIPMENT])
    expect(patch.core.expectedAttendees).toBe(120)
    expect(patch.equipment.requirements).toEqual(['projector', 'lectern'])
    expect(patch.equipment.technicalSupportNeeded).toBe(true)
    expect(patch.core.purpose).toBe(null)
  })

  it('Ignores a section the response never carried', () => {
    const form = toFormValues(request)
    expect(buildPatch(request, form, [CORE, VENUE, EQUIPMENT, 'internal'])).toEqual({})
  })
})
