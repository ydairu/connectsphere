export default function Tabs({ name, tabs, active, onSelect }) {
  function handleKeyDown(event, index) {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    onSelect(tabs[next].id)
    event.currentTarget.parentElement.children[next].focus()
  }

  return <div className="page-tabs" role="tablist" aria-label={name}>
    {tabs.map((tab, index) => <button
      key={tab.id}
      id={`${name}-${tab.id}-tab`}
      type="button"
      role="tab"
      aria-selected={active === tab.id}
      aria-controls={`${name}-${tab.id}-panel`}
      tabIndex={active === tab.id ? 0 : -1}
      onClick={() => onSelect(tab.id)}
      onKeyDown={(event) => handleKeyDown(event, index)}
    >{tab.label}</button>)}
  </div>
}
