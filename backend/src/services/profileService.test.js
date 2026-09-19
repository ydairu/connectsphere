// Approved organisation-name profile editing; in-memory persistence, not live Firebase.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { updateOrganisationName } from './profileService.js'

function fakeDb(initial = {}) {
  const users = new Map(Object.entries(initial))
  return {
    users,
    collection(name) {
      assert.equal(name, 'users')
      return { doc: (uid) => ({
        async update(fields) {
          if (!users.has(uid)) throw new Error('Profile does not exist')
          users.set(uid, { ...users.get(uid), ...fields })
        },
      }) }
    },
  }
}

const organiser = { uid: 'organiser-1', roles: ['organiser'] }

describe('Organisation name profile updates', () => {
  test('updates only the current user’s name and preserves identity and organisation permissions', async () => {
    const original = { email: 'org@example.com', name: 'Person', roles: ['organiser'], organisationId: 'org-1', organisationName: 'Old name' }
    const db = fakeDb({ [organiser.uid]: original, other: { organisationName: 'Other organisation' } })
    assert.deepEqual(await updateOrganisationName({ organisationName: ' New name ' }, organiser, db), { organisationName: 'New name' })
    assert.deepEqual(db.users.get(organiser.uid), { ...original, organisationName: 'New name' })
    assert.deepEqual(db.users.get('other'), { organisationName: 'Other organisation' })
  })

  test('supports existing profiles without a name, multi-role organisers, and legacy role profiles', async () => {
    for (const user of [organiser, { uid: 'multi', roles: ['attendee', 'organiser'] }, { uid: 'legacy', role: 'organiser' }]) {
      const db = fakeDb({ [user.uid]: user })
      await updateOrganisationName({ organisationName: 'Org A' }, user, db)
      assert.equal(db.users.get(user.uid).organisationName, 'Org A')
    }
  })

  test('rejects unauthenticated users and every non-organiser role', async () => {
    await assert.rejects(updateOrganisationName({ organisationName: 'Org A' }, null), { status: 401 })
    for (const roles of [[], ['attendee'], ['coordinator'], ['venue_staff'], ['technical_staff'], ['venue_staff', 'technical_staff']]) {
      await assert.rejects(updateOrganisationName({ organisationName: 'Org A' }, { uid: 'other', roles }), { status: 403 })
    }
  })

  test('rejects invalid names and malformed request bodies before persistence', async () => {
    const db = fakeDb({ [organiser.uid]: { organisationName: 'Original' } })
    for (const input of [null, undefined, [], 'Org A', {}, ...['', '  ', null, 4, {}, []].map((organisationName) => ({ organisationName }))]) {
      await assert.rejects(updateOrganisationName(input, organiser, db), { status: 400 })
    }
    assert.equal(db.users.get(organiser.uid).organisationName, 'Original')
  })

  test('rejects protected fields and attempts to target another user without writing', async () => {
    const db = fakeDb({ [organiser.uid]: { organisationName: 'Original' } })
    for (const field of ['uid', 'organisationId', 'roles', 'role', 'email', 'name', 'createdAt']) {
      await assert.rejects(updateOrganisationName({ organisationName: 'Org A', [field]: 'other' }, organiser, db), { status: 400 })
    }
    assert.equal(db.users.get(organiser.uid).organisationName, 'Original')
  })

  test('propagates persistence failures and does not recreate deleted profiles', async () => {
    const db = fakeDb()
    await assert.rejects(updateOrganisationName({ organisationName: 'Org A' }, organiser, db), /Profile does not exist/)
    assert.equal(db.users.size, 0)
  })
})
