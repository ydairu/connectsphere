import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Input from '../components/Input.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { getAuthErrorMessage } from '../utils/authErrors.js'

function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to="/profile" replace />

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      await login(form.email.trim(), form.password)
      navigate(location.state?.from?.pathname || '/profile', { replace: true })
    } catch (loginError) {
      setError(loginError.message === 'PROFILE_NOT_FOUND'
        ? 'Your account profile could not be found. Please contact support.'
        : getAuthErrorMessage(loginError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-shell">
      <Navbar />
      <main className="auth-page container">
        <Card className="auth-card">
          <div className="auth-heading">
            <span className="eyebrow">Attendees + Event Organisers</span>
            <h1>Welcome back</h1>
            <p>Log in to continue to your ConnectSphere account.</p>
          </div>
          <form onSubmit={handleSubmit} noValidate>
            {error && <div className="alert" role="alert">{error}</div>}
            <Input id="email" name="email" type="email" label="Email address" autoComplete="email" value={form.email} onChange={updateField} required />
            <Input id="password" name="password" type="password" label="Password" autoComplete="current-password" value={form.password} onChange={updateField} required />
            <Button className="button-full" type="submit" disabled={submitting}>
              {submitting ? 'Logging in…' : 'Log in'}
            </Button>
          </form>
          <p className="auth-footer">New to ConnectSphere? <Link to="/register">Create an account</Link></p>
        </Card>
      </main>
    </div>
  )
}

export default LoginPage
