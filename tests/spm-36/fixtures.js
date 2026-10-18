// SPM-36 — reuses SPM-56's fixtures (SPM-17 users, event and types, plus units: 3 Available projectors and
// 2 microphones). The AC's example asks for 5 projectors against 3.

export * from '../spm-56/fixtures.js'

export const fiveProjectors = Object.freeze({
  items: [{ equipmentTypeId: 'projector', quantity: 5 }],
  submissionKey: 'five-projectors',
})
