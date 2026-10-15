import {
  addEquipmentUnit,
  createEquipmentType,
  DuplicateAssetTagError,
  EquipmentNotFoundError,
  EquipmentUnitNotFoundError,
  EquipmentValidationError,
  getEquipmentType,
  listEquipmentAvailability,
  updateEquipmentUnitStatus,
} from '../services/equipmentService.js'

function sendEquipmentError(error, res, next) {
  if (error instanceof EquipmentValidationError) {
    return res.status(400).json({ message: 'Validation failed', errors: error.errors })
  }
  if (error instanceof DuplicateAssetTagError) {
    return res.status(409).json({ message: 'Asset tag already used', errors: error.errors })
  }
  if (error instanceof EquipmentNotFoundError) {
    return res.status(404).json({ message: 'Equipment not found' })
  }
  if (error instanceof EquipmentUnitNotFoundError) {
    return res.status(404).json({ message: 'Equipment unit not found' })
  }
  return next(error)
}

// getDb is called per request so tests can pass an in-memory database and production can use Firestore.
export function createEquipmentController(getDb) {
  return {
    async listEquipment(req, res, next) {
      try {
        return res.json(await listEquipmentAvailability(req.query, getDb()))
      } catch (error) {
        return sendEquipmentError(error, res, next)
      }
    },
    async createEquipmentType(req, res, next) {
      try {
        const equipment = await createEquipmentType(req.body, req.user, getDb())
        return res.status(201).json({ equipment })
      } catch (error) {
        return sendEquipmentError(error, res, next)
      }
    },
    async getEquipmentType(req, res, next) {
      try {
        const equipment = await getEquipmentType(req.params.id, getDb())
        return res.json({ equipment })
      } catch (error) {
        return sendEquipmentError(error, res, next)
      }
    },
    async addEquipmentUnit(req, res, next) {
      try {
        const unit = await addEquipmentUnit(req.params.id, req.body, req.user, getDb())
        return res.status(201).json({ unit })
      } catch (error) {
        return sendEquipmentError(error, res, next)
      }
    },
    async updateEquipmentUnitStatus(req, res, next) {
      try {
        const unit = await updateEquipmentUnitStatus(req.params.id, req.params.unitId, req.body, req.user, getDb())
        return res.json({ unit })
      } catch (error) {
        return sendEquipmentError(error, res, next)
      }
    },
  }
}
