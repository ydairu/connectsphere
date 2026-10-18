import { fixture as bookingFixture, input as bookingInput } from '../spm-14/fixtures.js'
export { coordinator, staff, secondStaff, organiser, now } from '../spm-14/fixtures.js'

export function fixture() {
  const db = bookingFixture()
  Object.assign(db.collectionData('venues').get('hall'), { maximumCapacity: 200, supportedLayouts: ['Theatre'], facilities: ['Projector'] })
  return db
}

export const input = { ...bookingInput, requirements: 'Theatre' }
