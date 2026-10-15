import { Router } from 'express'
import { COORDINATOR, TECHNICAL_STAFF } from '../../../shared/permissions.js'
import { createEquipmentController } from '../controllers/equipmentController.js'
import { requireRole } from '../middleware/requireRole.js'

// SPM-37: Technical Support Staff manage equipment (briefing). [Team decision, 15 Oct 2026] Event
// Coordinators may also view equipment availability, because initial feasibility considers it (CL1).
export function createEquipmentRoutes({ authenticate, getDb }) {
  const controller = createEquipmentController(getDb)
  const router = Router()

  router.get('/', authenticate, requireRole(TECHNICAL_STAFF, COORDINATOR), controller.listEquipment)
  router.post('/', authenticate, requireRole(TECHNICAL_STAFF), controller.createEquipmentType)
  router.get('/:id', authenticate, requireRole(TECHNICAL_STAFF, COORDINATOR), controller.getEquipmentType)
  router.post('/:id/units', authenticate, requireRole(TECHNICAL_STAFF), controller.addEquipmentUnit)
  router.patch('/:id/units/:unitId', authenticate, requireRole(TECHNICAL_STAFF), controller.updateEquipmentUnitStatus)

  return router
}
