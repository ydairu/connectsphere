import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Input from '../components/Input.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { getAuthErrorMessage } from '../utils/authErrors.js'

const initialForm = { name: '', email: '', password: '', confirmPassword: '', role: 'attendee' }

function validate(form) {
  const errors = {}
  if (!form.name.trim()) errors.name = 'Full name is required.'
  if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.email = 'Enter a valid email address.'
  if (form.password.length < 6) errors.password = 'Password must contain at least 6 characters.'
  if (form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match.'
  return errors
}

function RegisterPage() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to="/profile" replace />

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = validate(form)
    setErrors(nextErrors)
    setSubmitError('')
    if (Object.keys(nextErrors).length) return

    setSubmitting(true)
    try {
      await register({ name: form.name.trim(), email: form.email.trim(), password: form.password, role: form.role })
      navigate('/profile', { replace: true })
    } catch (registrationError) {
      setSubmitError(getAuthErrorMessage(registrationError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-shell">
      <Navbar />
      <main className="auth-page container">
        <Card className="auth-card auth-card-wide">
          <div className="auth-heading">
            <span className="eyebrow">Join ConnectSphere</span>
            <h1>Create your account</h1>
            <p>Choose how you will use the platform. You can update your details later.</p>
          </div>
          <form onSubmit={handleSubmit} noValidate>
            {submitError && <div className="alert" role="alert">{submitError}</div>}
            <Input id="name" name="name" label="Full name" autoComplete="name" value={form.name} onChange={updateField} error={errors.name} required />
            <Input id="email" name="email" type="email" label="Email address" autoComplete="email" value={form.email} onChange={updateField} error={errors.email} required />
            <div className="field-row">
              <Input id="password" name="password" type="password" label="Password" autoComplete="new-password" value={form.password} onChange={updateField} error={errors.password} required />
              <Input id="confirmPassword" name="confirmPassword" type="password" label="Confirm password" autoComplete="new-password" value={form.confirmPassword} onChange={updateField} error={errors.confirmPassword} required />
            </div>
            <fieldset className="role-selector">
              <legend>Account role</legend>
              <label className={form.role === 'attendee' ? 'role-option selected' : 'role-option'}>
                <input type="radio" name="role" value="attendee" checked={form.role === 'attendee'} onChange={updateField} />
                <span><strong>Attendee</strong><small>Access events and attendee resources.</small></span>
              </label>
              <label className={form.role === 'employee' ? 'role-option selected' : 'role-option'}>
                <input type="radio" name="role" value="employee" checked={form.role === 'employee'} onChange={updateField} />
                <span><strong>Employee</strong><small>Support and coordinate event operations.</small></span>
              </label>
            </fieldset>
            <p className="form-note">Prototype note: employee self-registration is enabled. Production employee accounts should be provisioned or approved by an administrator.</p>
            <Button className="button-full" type="submit" disabled={submitting}>{submitting ? 'Creating account…' : 'Create account'}</Button>
          </form>
          <p className="auth-footer">Already have an account? <Link to="/login">Log in</Link></p>
        </Card>
      </main>
    </div>
  )
}

export default RegisterPage

