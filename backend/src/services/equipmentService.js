import {
  EQUIPMENT_UNIT_STATUS,
  EQUIPMENT_UNIT_STATUS_CHANGED,
  hasEquipmentValidationErrors,
  normaliseAvailabilityPeriod,
  normaliseEquipmentTypeInput,
  normaliseEquipmentUnitInput,
  normaliseUnitStatusInput,
  summariseUnits,
} from '../../../shared/equipment.js'
import { TECHNICAL_STAFF } from '../../../shared/permissions.js'
import { getAdminDb } from '../config/firebaseAdmin.js'

// SPM-37 — equipment types, their units and the available quantity. See shared/equipment.js for the model.

export const EQUIPMENT_TYPES = 'equipmentTypes'
export const EQUIPMENT_UNITS = 'equipmentUnits'

export class EquipmentValidationError extends Error {
  constructor(errors) {
    super('Equipment validation failed.')
    this.name = 'EquipmentValidationError'
    this.errors = errors
  }
}

export class EquipmentNotFoundError extends Error {
  constructor(id) {
    super(`Equipment ${id} was not found.`)
    this.name = 'EquipmentNotFoundError'
    this.id = id
  }
}

export class EquipmentUnitNotFoundError extends Error {
  constructor(id) {
    super(`Equipment unit ${id} was not found.`)
    this.name = 'EquipmentUnitNotFoundError'
    this.id = id
  }
}

export class DuplicateAssetTagError extends Error {
  constructor(assetTag) {
    super(`Asset tag ${assetTag} is already used by this equipment type.`)
    this.name = 'DuplicateAssetTagError'
    this.errors = { assetTag: 'This asset tag is already used by this equipment type.' }
  }
}

function actorName(staff) {
  return staff.name ?? staff.email ?? null
}

function requireStaff(staff, field) {
  if (!staff?.uid) throw new EquipmentValidationError({ [field]: 'An authenticated Technical Support Staff member is required.' })
}

function byAssetTag(left, right) {
  return left.assetTag.localeCompare(right.assetTag, undefined, { numeric: true }) || left.id.localeCompare(right.id)
}

async function loadUnits(db, equipmentTypeId) {
  const snapshot = await db.collection(EQUIPMENT_UNITS).where('equipmentTypeId', '==', equipmentTypeId).get()
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
}

async function getEquipmentTypeRecord(id, db) {
  const snapshot = await db.collection(EQUIPMENT_TYPES).doc(id).get()
  if (!snapshot.exists) throw new EquipmentNotFoundError(id)
  return { id: snapshot.id, ...snapshot.data() }
}

export async function createEquipmentType(input, staff, db = getAdminDb(), now = new Date()) {
  const { equipmentType, errors } = normaliseEquipmentTypeInput(input)
  if (!staff?.uid) errors.createdByUid = 'An authenticated Technical Support Staff member is required.'
  if (hasEquipmentValidationErrors(errors)) throw new EquipmentValidationError(errors)

  const record = {
    ...equipmentType,
    createdByUid: staff.uid,
    createdByName: actorName(staff),
    createdAt: now.toISOString(),
  }
  const docRef = await db.collection(EQUIPMENT_TYPES).add(record)
  return { id: docRef.id, ...record, ...summariseUnits([]) }
}

// SPM-37 AC1–AC4: every equipment type with its total, available and unavailable unit counts. A period is
// optional and validated; the counts do not depend on it until reservations exist (shared/equipment.js).
export async function listEquipmentAvailability(query = {}, db = getAdminDb()) {
  const { period, errors } = normaliseAvailabilityPeriod(query)
  if (hasEquipmentValidationErrors(errors)) throw new EquipmentValidationError(errors)

  const [typesSnapshot, unitsSnapshot] = await Promise.all([
    db.collection(EQUIPMENT_TYPES).get(),
    db.collection(EQUIPMENT_UNITS).get(),
  ])
  const unitsByType = new Map()
  for (const doc of unitsSnapshot.docs) {
    const unit = doc.data()
    if (!unitsByType.has(unit.equipmentTypeId)) unitsByType.set(unit.equipmentTypeId, [])
    unitsByType.get(unit.equipmentTypeId).push(unit)
  }

  const equipment = typesSnapshot.docs
    .map((doc) => {
      const { name, location } = doc.data()
      return { id: doc.id, name, location: location ?? null, ...summariseUnits(unitsByType.get(doc.id)) }
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))

  return { period, equipment }
}

export async function getEquipmentType(id, db = getAdminDb()) {
  const equipmentType = await getEquipmentTypeRecord(id, db)
  const units = (await loadUnits(db, id)).sort(byAssetTag)
  return { ...equipmentType, ...summariseUnits(units), units }
}

// New units start Available. Asset tags are unique within their equipment type; the check runs in the
// same transaction as the write, so two staff adding the same tag at once cannot both succeed.
export async function addEquipmentUnit(equipmentTypeId, input, staff, db = getAdminDb(), now = new Date()) {
  const { unit, errors } = normaliseEquipmentUnitInput(input)
  if (!staff?.uid) errors.createdByUid = 'An authenticated Technical Support Staff member is required.'
  if (hasEquipmentValidationErrors(errors)) throw new EquipmentValidationError(errors)

  const typeRef = db.collection(EQUIPMENT_TYPES).doc(equipmentTypeId)
  const unitRef = db.collection(EQUIPMENT_UNITS).doc()
  const at = now.toISOString()
  const record = {
    equipmentTypeId,
    assetTag: unit.assetTag,
    status: EQUIPMENT_UNIT_STATUS.AVAILABLE,
    statusNote: null,
    createdByUid: staff.uid,
    createdByName: actorName(staff),
    createdAt: at,
    updatedByUid: staff.uid,
    updatedByName: actorName(staff),
    updatedAt: at,
  }

  await db.runTransaction(async (tx) => {
    const typeSnapshot = await tx.get(typeRef)
    if (!typeSnapshot.exists) throw new EquipmentNotFoundError(equipmentTypeId)

    const existing = await tx.get(db.collection(EQUIPMENT_UNITS).where('equipmentTypeId', '==', equipmentTypeId))
    const tag = unit.assetTag.toLowerCase()
    if (existing.docs.some((doc) => doc.data().assetTag?.toLowerCase() === tag)) throw new DuplicateAssetTagError(unit.assetTag)

    tx.set(unitRef, record)
  })

  return { id: unitRef.id, ...record }
}

// SPM-37 AC1–AC4: a unit marked Damaged, Under Repair or Unavailable leaves the available count, and one
// marked Available again returns to it. Each change is recorded in the unit's activity history.
export async function updateEquipmentUnitStatus(equipmentTypeId, unitId, input, staff, db = getAdminDb(), now = new Date()) {
  const { change, errors } = normaliseUnitStatusInput(input)
  if (hasEquipmentValidationErrors(errors)) throw new EquipmentValidationError(errors)
  requireStaff(staff, 'updatedByUid')

  const unitRef = db.collection(EQUIPMENT_UNITS).doc(unitId)
  const at = now.toISOString()

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(unitRef)
    if (!snapshot.exists) throw new EquipmentUnitNotFoundError(unitId)

    const existing = snapshot.data()
    if (existing.equipmentTypeId !== equipmentTypeId) throw new EquipmentUnitNotFoundError(unitId)
    if (existing.status === change.status && (existing.statusNote ?? null) === change.note) {
      return { id: unitId, ...existing }
    }

    const update = {
      status: change.status,
      statusNote: change.note,
      updatedByUid: staff.uid,
      updatedByName: actorName(staff),
      updatedAt: at,
    }
    tx.update(unitRef, update)
    tx.set(unitRef.collection('activity').doc(), {
      type: EQUIPMENT_UNIT_STATUS_CHANGED,
      previousStatus: existing.status ?? null,
      newStatus: change.status,
      note: change.note,
      actor: { type: 'user', uid: staff.uid, name: staff.name ?? null, role: TECHNICAL_STAFF },
      at,
    })

    return { id: unitId, ...existing, ...update }
  })
}
