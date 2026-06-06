import { useState, useEffect } from 'react'

export default function Header() {
  const [dark, setDark] = useState(
    () => localStorage.getItem('theme') === 'dark'
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <header>
      <span>Lumière Archive</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <span>Issue 01 / Curated Selection</span>
        <button className="theme-toggle" onClick={() => setDark(d => !d)}>
          {dark ? 'Light' : 'Dark'}
        </button>
      </div>
    </header>
  )
}
