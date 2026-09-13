import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'

function HomePage() {
  return (
    <div className="page-shell">
      <Navbar />
      <main>
        <section className="hero container">
          <div className="eyebrow">One platform. Every connection.</div>
          <h1>Manage events.<br />Stay connected.</h1>
          <p className="hero-copy">
            A simple platform for attendees and event teams to access everything they need in one place.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/register">Create an account</Link>
            <Link className="button button-secondary" to="/login">Log in</Link>
          </div>
        </section>
        <section className="feature-strip container" aria-label="Platform benefits">
          <div><strong>For attendees</strong><span>Keep event information close at hand.</span></div>
          <div><strong>For event teams</strong><span>Prepare, coordinate, and stay aligned.</span></div>
          <div><strong>Built for clarity</strong><span>A focused experience without the clutter.</span></div>
        </section>
      </main>
    </div>
  )
}

export default HomePage

