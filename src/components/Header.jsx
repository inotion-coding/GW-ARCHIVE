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
      <span>GW Archive</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <button className="theme-toggle" onClick={() => setDark(d => !d)}>
          {dark ? 'Light' : 'Dark'}
        </button>
        <button className="theme-toggle">
          Settings
        </button>
      </div>
    </header>
  )
}
