import { fixture as bookingFixture } from '../spm-14/fixtures.js'
export { coordinator, staff, secondStaff, organiser, input, now } from '../spm-14/fixtures.js'

export function fixture() {
  const db = bookingFixture()
  Object.assign(db.collectionData('venues').get('hall'), { maximumCapacity: 200, supportedLayouts: ['Theatre'], facilities: ['Projector'] })
  return db
}
