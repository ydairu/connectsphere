// Event request handlers — load, send, update. Authorisation is not decided here: every response body is
// produced by authorise.js. Create, submit and draft-save belong to SPM-7, SPM-3 and SPM-4.

import { COORDINATOR, rolesOf } from '../../../shared/permissions.js'
import { historyEntriesForEdit } from '../../../shared/changeHistory.js'
import { presentRequest } from '../middleware/authorise.js'
import { StaleWriteError } from '../services/eventRequestStore.js'

function newestFirst(a, b) {
  return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
}

// loadCoordinatorName (SPM-46) comes from services/assignedCoordinatorService.js and reads users/{uid} only
// for an Organiser who may see the assigned Coordinator. loadOwnerNames (SPM-64 follow-up) comes from
// services/requestOwnerService.js and reads only the owners an Organiser may see named.
export function createRequestController(store, loadCoordinatorName, loadOwnerNames = async () => new Map()) {
  return {
    async loadAll(req, _res, next) {
      // SPM-65: a coordinator-only user is served by a query on assignedCoordinatorUid, using the uid from
      // the verified token — nothing in the request can name another coordinator. Every other user, a
      // coordinator holding a second role included, gets the full list. Either way authoriseList's
      // inScope() filter makes the decision; the query only narrows what is read.
      const roles = rolesOf(req.user)
      const requests = roles.length === 1 && roles[0] === COORDINATOR
        ? await store.listAssignedToCoordinator(req.user.uid)
        : await store.list()
      req.eventRequests = requests.sort(newestFirst)
      return next()
    },

    async loadOne(req, res, next) {
      const found = await store.get(req.params.id)
      if (!found) return res.status(404).json({ message: 'Not found' })
      req.eventRequest = found.request
      req.eventRequestVersion = found.version
      return next()
    },

    // SPM-64 follow-up: runs before authoriseList / authoriseRead, which add the names to what they send.
    async loadOwnerNames(req, _res, next) {
      req.ownerNames = await loadOwnerNames(req.user, req.eventRequests ?? [req.eventRequest])
      return next()
    },

    // SPM-46: runs before authoriseRead, which puts the name in the body only if the user may see it.
    async loadAssignedCoordinatorName(req, _res, next) {
      req.assignedCoordinatorName = await loadCoordinatorName(req.user, req.eventRequest)
      return next()
    },

    sendList(_req, res) {
      res.json({ requests: res.locals.requests })
    },

    sendOne(_req, res) {
      res.json(res.locals.body)
    },

    // SPM-28: runs after authoriseHistory has allowed the read; visibleChangeHistory() decides the entries.
    async loadFieldHistory(req, _res, next) {
      req.fieldHistory = await store.listFieldHistory(req.params.id)
      return next()
    },

    async update(req, res) {
      try {
        // SPM-28: one field_changed entry per changed field, written in the same transaction as the edit.
        const { request } = await store.update(req.params.id, req.body, {
          version: req.eventRequestVersion,
          recordChanges: (before, after) => historyEntriesForEdit(req.user, before, after),
        })
        const coordinatorName = await loadCoordinatorName(req.user, request)
        const ownerNames = await loadOwnerNames(req.user, [request])
        return res.json(presentRequest(req.user, request, { coordinatorName, ownerNames }))
      } catch (error) {
        if (error instanceof StaleWriteError) {
          return res.status(409).json({ message: 'This request changed since it was loaded. Reload and try again.' })
        }
        throw error
      }
    },
  }
}
