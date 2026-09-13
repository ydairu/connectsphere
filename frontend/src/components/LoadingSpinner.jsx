function LoadingSpinner({ label = 'Loading' }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export default LoadingSpinner

