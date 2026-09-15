// Event request handlers — load, send, update. Authorisation is not decided here: every response body is
// produced by authorise.js. Create, submit and draft-save belong to SPM-7, SPM-3 and SPM-4.

import { presentRequest } from '../middleware/authorise.js'
import { StaleWriteError } from '../services/eventRequestStore.js'

function newestFirst(a, b) {
  return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
}

export function createRequestController(store) {
  return {
    async loadAll(req, _res, next) {
      req.eventRequests = (await store.list()).sort(newestFirst)
      return next()
    },

    async loadOne(req, res, next) {
      const found = await store.get(req.params.id)
      if (!found) return res.status(404).json({ message: 'Not found' })
      req.eventRequest = found.request
      req.eventRequestVersion = found.version
      return next()
    },

    sendList(_req, res) {
      res.json({ requests: res.locals.requests })
    },

    sendOne(_req, res) {
      res.json(res.locals.body)
    },

    async update(req, res) {
      try {
        const { request } = await store.update(req.params.id, req.body, { version: req.eventRequestVersion })
        return res.json(presentRequest(req.user, request))
      } catch (error) {
        if (error instanceof StaleWriteError) {
          return res.status(409).json({ message: 'This request changed since it was loaded. Reload and try again.' })
        }
        throw error
      }
    },
  }
}
