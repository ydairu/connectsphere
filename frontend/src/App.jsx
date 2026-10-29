import { Navigate, Route, Routes } from 'react-router-dom'
import { ATTENDEE, COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../shared/permissions.js'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import CreateEventRequestPage from './pages/CreateEventRequestPage.jsx'
import CreateVenuePage from './pages/CreateVenuePage.jsx'
import DraftRequestsPage from './pages/DraftRequestsPage.jsx'
import EquipmentDetailPage from './pages/EquipmentDetailPage.jsx'
import EquipmentRequestQueuePage from './pages/EquipmentRequestQueuePage.jsx'
import EquipmentPage from './pages/EquipmentPage.jsx'
import EquipmentReservationsPage from './pages/EquipmentReservationsPage.jsx'
import EditVenuePage from './pages/EditVenuePage.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import MyRegistrationsPage from './pages/MyRegistrationsPage.jsx'
import NotificationsPage from './pages/NotificationsPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import RequestDetailPage from './pages/RequestDetailPage.jsx'
import RequestsPage from './pages/RequestsPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import VenueCataloguePage from './pages/VenueCataloguePage.jsx'
import VenueAvailabilityPage from './pages/VenueAvailabilityPage.jsx'
import VenueDetailPage from './pages/VenueDetailPage.jsx'
import VenueBookingsPage from './pages/VenueBookingsPage.jsx'

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
      {/* SPM-19: an Attendee's own registrations. The API returns only the caller's own. */}
      <Route element={<ProtectedRoute allowedRoles={[ATTENDEE]} />}>
        <Route path="/registrations" element={<MyRegistrationsPage />} />
      </Route>
      {/* Drafts and the request form belong to Event Organisers. The API enforces this too:
          requireRole(ORGANISER) on /api/event-requests, and owner-only scope on drafts. */}
      <Route element={<ProtectedRoute allowedRoles={[ORGANISER]} />}>
        <Route path="/requests/drafts" element={<DraftRequestsPage />} />
        <Route path="/event-requests/new" element={<CreateEventRequestPage />} />
        <Route path="/event-requests/:id/edit" element={<CreateEventRequestPage />} />
      </Route>
      {/* SPM-49 catalogue viewing belongs to Event Coordinators and Venue Staff; creation remains Venue Staff-only. */}
      <Route element={<ProtectedRoute allowedRoles={[COORDINATOR, VENUE_STAFF]} />}>
        <Route path="/requests/:id/venue-bookings" element={<VenueBookingsPage />} />
        <Route path="/venues" element={<VenueCataloguePage />} />
        <Route path="/venues/:id/availability" element={<VenueAvailabilityPage />} />
        <Route path="/venues/:id" element={<VenueDetailPage />} />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={[VENUE_STAFF]} />}>
        <Route path="/venues/booking-requests" element={<VenueBookingsPage />} />
        <Route path="/venues/new" element={<CreateVenuePage />} />
        <Route path="/venues/:id/edit" element={<EditVenuePage />} />
      </Route>
      {/* SPM-37: Technical Support Staff manage equipment; Event Coordinators view its availability. */}
      <Route element={<ProtectedRoute allowedRoles={[COORDINATOR, TECHNICAL_STAFF]} />}>
        <Route path="/equipment" element={<EquipmentPage />} />
        <Route path="/equipment/:id" element={<EquipmentDetailPage />} />
      </Route>
      {/* SPM-56: the Technical Support Staff member's own equipment request queue. The API enforces the role too. */}
      <Route element={<ProtectedRoute allowedRoles={[TECHNICAL_STAFF]} />}>
        <Route path="/equipment/requests" element={<EquipmentRequestQueuePage />} />
        {/* SPM-58: reached from the Equipment page, not the navbar. */}
        <Route path="/equipment/reservations" element={<EquipmentReservationsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
