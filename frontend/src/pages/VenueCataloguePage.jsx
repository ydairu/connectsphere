import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { VENUE_STAFF } from '../../../shared/permissions.js'
import Card from '../components/Card.jsx'
import Input from '../components/Input.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { listVenues } from '../services/api.js'

const EMPTY_SEARCH_FORM = Object.freeze({
  availableFrom: '',
  availableTo: '',
  attendance: '',
  location: '',
  layout: '',
  facilities: Object.freeze([]),
  accessibility: Object.freeze([]),
})

const EMPTY_FILTER_OPTIONS = Object.freeze({
  locations: [],
  layouts: [],
  facilities: [],
  accessibilityFeatures: [],
})

// The API names its errors after the query parameters; the form names its fields after the inputs.
const API_ERROR_FIELDS = Object.freeze({
  from: 'availableFrom',
  to: 'availableTo',
  attendance: 'attendance',
  location: 'location',
  layout: 'layout',
  facility: 'facilities',
  accessibility: 'accessibility',
})

function toApiDateTime(value) {
  return new Date(value).toISOString()
}

function formatDateTime(value) {
  return new Date(value).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })
}

function hasSearchInput(form) {
  return Boolean(
    form.availableFrom ||
      form.availableTo ||
      form.attendance.trim() ||
      form.location ||
      form.layout ||
      form.facilities.length > 0 ||
      form.accessibility.length > 0,
  )
}

// SPM-12: every filter is optional. Only the filters the Coordinator applied are sent, so a search
// with none of them shows the whole catalogue.
function buildSearch(form) {
  const errors = {}
  const search = {}

  if (form.availableFrom || form.availableTo) {
    if (!form.availableFrom) errors.availableFrom = 'Enter a start, or leave both dates empty.'
    if (!form.availableTo) errors.availableTo = 'Enter an end, or leave both dates empty.'
    if (form.availableFrom && form.availableTo) {
      if (new Date(form.availableFrom) >= new Date(form.availableTo)) {
        errors.availableTo = 'The end must be after the start.'
      } else {
        search.availableFrom = toApiDateTime(form.availableFrom)
        search.availableTo = toApiDateTime(form.availableTo)
      }
    }
  }

  const attendance = form.attendance.trim()
  if (attendance) {
    const number = Number(attendance)
    if (!Number.isInteger(number) || number <= 0) errors.attendance = 'Enter a positive whole number.'
    else search.attendance = number
  }

  if (form.location) search.location = form.location
  if (form.layout) search.layout = form.layout
  if (form.facilities.length > 0) search.facilities = [...form.facilities]
  if (form.accessibility.length > 0) search.accessibility = [...form.accessibility]

  return { search: Object.keys(search).length > 0 ? search : null, errors }
}

function describeSearch(search) {
  const applied = []
  if (search.availableFrom) applied.push(`Available ${formatDateTime(search.availableFrom)} to ${formatDateTime(search.availableTo)}`)
  if (search.attendance) applied.push(`Expected attendance: ${search.attendance}`)
  if (search.location) applied.push(`Location: ${search.location}`)
  if (search.layout) applied.push(`Layout: ${search.layout}`)
  if (search.accessibility) applied.push(`Accessibility: ${search.accessibility.join(', ')}`)
  if (search.facilities) applied.push(`Facilities: ${search.facilities.join(', ')}`)
  return applied
}

function InlineList({ items }) {
  if (!Array.isArray(items) || items.length === 0) return <span>Not recorded</span>
  return <span>{items.join(', ')}</span>
}

function TextValue({ children }) {
  if (children === undefined || children === null || children === '') return <span>Not recorded</span>
  return <span>{children}</span>
}

function SelectField({ id, label, value, onChange, anyLabel, options, error }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={onChange} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}>
        <option value="">{anyLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      {error && <span className="field-error" id={`${id}-error`}>{error}</span>}
    </div>
  )
}

function CheckboxFilter({ name, legend, hint, emptyText, options, selected, onToggle, error }) {
  return (
    <fieldset className="filter-group">
      <legend>{legend}</legend>
      <p className="request-meta">{hint}</p>
      {options.length === 0 ? (
        <p className="request-meta">{emptyText}</p>
      ) : (
        <div className="filter-options">
          {options.map((option, index) => (
            <label key={option} className="checkbox-field" htmlFor={`${name}-${index}`}>
              <input
                id={`${name}-${index}`}
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => onToggle(option)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      )}
      {error && <span className="field-error">{error}</span>}
    </fieldset>
  )
}

function AppliedFilters({ search }) {
  return (
    <ul className="applied-filters" aria-label="Applied filters">
      {describeSearch(search).map((filter) => (
        <li key={filter}>{filter}</li>
      ))}
    </ul>
  )
}

function VenueCataloguePage() {
  const { user, roles } = useAuth()
  const [venues, setVenues] = useState([])
  const [filterOptions, setFilterOptions] = useState(EMPTY_FILTER_OPTIONS)
  const [searchForm, setSearchForm] = useState(EMPTY_SEARCH_FORM)
  const [searchErrors, setSearchErrors] = useState({})
  const [activeSearch, setActiveSearch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const canAddVenue = roles.includes(VENUE_STAFF)

  useEffect(() => {
    let active = true

    async function loadVenues() {
      try {
        const response = activeSearch ? await listVenues(user, activeSearch) : await listVenues(user)
        if (!active) return
        setVenues(response.venues)
        if (response.filterOptions) setFilterOptions(response.filterOptions)
      } catch (venueError) {
        if (!active) return
        if (venueError.status === 401) setError('Your session has expired. Please log in again.')
        else if (venueError.status === 403) setError('You do not have access to the venue catalogue.')
        else if (venueError.status === 400) {
          const fieldErrors = {}
          for (const [key, message] of Object.entries(venueError.details?.errors ?? {})) {
            fieldErrors[API_ERROR_FIELDS[key] ?? key] = message
          }
          setSearchErrors(fieldErrors)
          setError('Some search filters are not valid. Correct the highlighted filters and search again.')
        } else setError('We could not load the venue catalogue. Please try again.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadVenues()
    return () => {
      active = false
    }
  }, [activeSearch, user])

  function updateSearchField(field, value) {
    setSearchForm((current) => ({ ...current, [field]: value }))
  }

  function toggleSearchValue(field, value) {
    setSearchForm((current) => {
      const selected = current[field]
      return {
        ...current,
        [field]: selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value],
      }
    })
  }

  function runSearch(nextSearch) {
    // Re-running the unfiltered catalogue would not change activeSearch, so the effect would not
    // run and the page would stay loading.
    if (!nextSearch && !activeSearch) return
    setLoading(true)
    setError(null)
    setActiveSearch(nextSearch)
  }

  function searchVenues(event) {
    event.preventDefault()
    const { search, errors } = buildSearch(searchForm)
    setSearchErrors(errors)
    if (Object.keys(errors).length > 0) return
    runSearch(search)
  }

  function clearFilters() {
    setSearchForm(EMPTY_SEARCH_FORM)
    setSearchErrors({})
    runSearch(null)
  }

  return (
    <div className="page-shell">
      <Navbar />
      <main className="request-page container">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Venue catalogue</span>
            <h1>Available venues</h1>
            <p>View location, capacity, facilities, accessibility, layouts, and operating hours for each venue.</p>
          </div>
          {canAddVenue && <Link className="button button-secondary button-small" to="/venues/new">Add venue</Link>}
        </div>

        <Card className="request-form-section availability-controls">
          <h2>Search by event requirements</h2>
          <p className="request-meta">
            Every filter is optional. A venue is shown only if it meets all of the filters you apply. Bookings,
            tentative holds and maintenance blocks make a venue unavailable for the period.
          </p>
          <form onSubmit={searchVenues} noValidate>
            <div className="field-row">
              <Input
                id="availableFrom"
                label="Available from"
                type="datetime-local"
                value={searchForm.availableFrom}
                onChange={(event) => updateSearchField('availableFrom', event.target.value)}
                error={searchErrors.availableFrom}
              />
              <Input
                id="availableTo"
                label="Available to"
                type="datetime-local"
                value={searchForm.availableTo}
                onChange={(event) => updateSearchField('availableTo', event.target.value)}
                error={searchErrors.availableTo}
              />
            </div>
            <div className="venue-search-grid">
              <Input
                id="attendance"
                label="Expected attendance"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={searchForm.attendance}
                onChange={(event) => updateSearchField('attendance', event.target.value)}
                error={searchErrors.attendance}
              />
              <SelectField
                id="location"
                label="Location"
                anyLabel="Any location"
                options={filterOptions.locations}
                value={searchForm.location}
                onChange={(event) => updateSearchField('location', event.target.value)}
                error={searchErrors.location}
              />
              <SelectField
                id="layout"
                label="Layout"
                anyLabel="Any layout"
                options={filterOptions.layouts}
                value={searchForm.layout}
                onChange={(event) => updateSearchField('layout', event.target.value)}
                error={searchErrors.layout}
              />
            </div>
            <div className="field-row">
              <CheckboxFilter
                name="accessibility"
                legend="Accessibility requirements"
                hint="Tick each requirement the event needs. Only venues marked with every ticked requirement are shown."
                emptyText="No accessibility features are recorded in the catalogue yet."
                options={filterOptions.accessibilityFeatures}
                selected={searchForm.accessibility}
                onToggle={(value) => toggleSearchValue('accessibility', value)}
                error={searchErrors.accessibility}
              />
              <CheckboxFilter
                name="facility"
                legend="Required facilities"
                hint="Only venues with every ticked facility are shown."
                emptyText="No facilities are recorded in the catalogue yet."
                options={filterOptions.facilities}
                selected={searchForm.facilities}
                onToggle={(value) => toggleSearchValue('facilities', value)}
                error={searchErrors.facilities}
              />
            </div>
            <div className="form-actions venue-search-actions">
              {(activeSearch || hasSearchInput(searchForm)) && (
                <button className="button button-secondary" type="button" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
              <button className="button button-primary" type="submit">Search available venues</button>
            </div>
          </form>
        </Card>

        {loading && <Card><LoadingSpinner label="Loading venues" /></Card>}

        {!loading && error && <div className="alert alert-error" role="alert">{error}</div>}

        {!loading && !error && venues.length === 0 && activeSearch && (
          <Card className="empty-state">
            <h2>No matching venues</h2>
            <p>No venues in the catalogue meet all of the selected filters. Change or clear a filter to see more venues.</p>
            <AppliedFilters search={activeSearch} />
            <button className="button button-secondary" type="button" onClick={clearFilters}>Clear filters</button>
          </Card>
        )}

        {!loading && !error && venues.length === 0 && !activeSearch && (
          <Card className="empty-state">
            <h2>No venues yet</h2>
            <p>Add the first venue so the catalogue can be used for planning and availability workflows.</p>
            {canAddVenue && <Link className="button button-primary" to="/venues/new">Add venue</Link>}
          </Card>
        )}

        {!loading && !error && venues.length > 0 && (
          <>
            {activeSearch && (
              <div className="search-summary">
                <p className="request-meta" role="status">
                  {venues.length === 1 ? '1 venue matches' : `${venues.length} venues match`} the selected filters.
                </p>
                <AppliedFilters search={activeSearch} />
              </div>
            )}
            <ul className="venue-list">
              {venues.map((venue) => (
                <li key={venue.id}>
                  <Card className="venue-card">
                    <div className="venue-card-main">
                      <h2>{venue.name}</h2>
                      <p className="request-meta"><TextValue>{venue.location}</TextValue></p>
                      <dl className="venue-summary-grid">
                        <div>
                          <dt>Capacity</dt>
                          <dd><TextValue>{venue.maximumCapacity}</TextValue></dd>
                        </div>
                        <div>
                          <dt>Layouts</dt>
                          <dd><InlineList items={venue.supportedLayouts} /></dd>
                        </div>
                        <div>
                          <dt>Facilities</dt>
                          <dd><InlineList items={venue.facilities} /></dd>
                        </div>
                        <div>
                          <dt>Accessibility</dt>
                          <dd><InlineList items={venue.accessibilityFeatures} /></dd>
                        </div>
                      </dl>
                      <p className="venue-hours">Operating hours: <TextValue>{venue.operatingHours}</TextValue></p>
                    </div>
                    <div className="request-item-actions">
                      <Link className="button button-secondary button-small" to={`/venues/${venue.id}`}>View details</Link>
                      <Link className="button button-secondary button-small" to={`/venues/${venue.id}/availability`}>View availability</Link>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  )
}

export default VenueCataloguePage
