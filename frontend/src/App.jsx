import { Navigate, Route, Routes } from 'react-router-dom'
import { ORGANISER, VENUE_STAFF } from '../../shared/permissions.js'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import CreateEventRequestPage from './pages/CreateEventRequestPage.jsx'
import CreateVenuePage from './pages/CreateVenuePage.jsx'
import DraftRequestsPage from './pages/DraftRequestsPage.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import NotificationsPage from './pages/NotificationsPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import RequestDetailPage from './pages/RequestDetailPage.jsx'
import RequestsPage from './pages/RequestsPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import VenueCataloguePage from './pages/VenueCataloguePage.jsx'
import VenueDetailPage from './pages/VenueDetailPage.jsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/profile" element={<ProfilePage />} />
        {/* Every role may list requests; the API decides which records they receive (SPM-42). */}
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/requests/:id" element={<RequestDetailPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
      </Route>
      {/* Drafts and the request form belong to Event Organisers. The API enforces this too:
          requireRole(ORGANISER) on /api/event-requests, and owner-only scope on drafts. */}
      <Route element={<ProtectedRoute allowedRoles={[ORGANISER]} />}>
        <Route path="/requests/drafts" element={<DraftRequestsPage />} />
        <Route path="/event-requests/new" element={<CreateEventRequestPage />} />
        <Route path="/event-requests/:id/edit" element={<CreateEventRequestPage />} />
      </Route>
      {/* Venue catalogue creation belongs to Venue Staff. The API enforces this with requireRole(VENUE_STAFF). */}
      <Route element={<ProtectedRoute allowedRoles={[VENUE_STAFF]} />}>
        <Route path="/venues" element={<VenueCataloguePage />} />
        <Route path="/venues/new" element={<CreateVenuePage />} />
        <Route path="/venues/:id" element={<VenueDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
