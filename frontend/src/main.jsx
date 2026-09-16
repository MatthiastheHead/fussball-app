import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

const normalizeRosterNavigation = () => {
  document.querySelectorAll('.settings-category-grid button').forEach((button) => {
    const text = button.textContent || ''

    if (text.includes('Teamverwaltung')) {
      button.style.display = 'none'
      button.setAttribute('aria-hidden', 'true')
      button.tabIndex = -1
      return
    }

    if (text.includes('Spielkader')) {
      const title = button.querySelector('strong')
      const description = button.querySelector('small')
      const meta = button.querySelector('em')
      if (title) title.textContent = 'Kaderverwaltung'
      if (description) description.textContent = 'Spielerinnen, Gastspielerinnen, Trainer, Rückennummern und Positionen zentral verwalten.'
      if (meta) meta.textContent = 'Ein Kader für Training und Spiele'
    }
  })
}

const observer = new MutationObserver(normalizeRosterNavigation)
observer.observe(document.documentElement, { childList: true, subtree: true })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

queueMicrotask(normalizeRosterNavigation)
