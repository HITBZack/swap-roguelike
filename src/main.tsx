import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'

const container = document.getElementById('app')
if (!container) {
  throw new Error('#app container not found')
}

const root = createRoot(container)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
