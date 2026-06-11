import { useState, useEffect } from 'react'

// 저장된 사용자 설정이 있으면 그것을, 없으면 컴퓨터(OS) 기본 설정을 따른다
function getInitialDark() {
  const stored = localStorage.getItem('theme')
  if (stored === 'dark') return true
  if (stored === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export default function Header() {
  const [dark, setDark] = useState(getInitialDark)

  // 테마 클래스만 반영 (저장은 수동 토글 시에만)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  // 사용자가 수동 설정을 하지 않았다면 OS 테마 변경을 실시간 반영
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => {
      if (!localStorage.getItem('theme')) setDark(e.matches)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // 수동 토글 → 사용자 선택을 영구 저장
  const toggleTheme = () => {
    setDark((d) => {
      const next = !d
      localStorage.setItem('theme', next ? 'dark' : 'light')
      return next
    })
  }

  return (
    <header>
      <span>GW ARCHIVE</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <button className="theme-toggle" onClick={toggleTheme}>
          {dark ? 'Light' : 'Dark'}
        </button>
        <button className="theme-toggle">
          Settings
        </button>
      </div>
    </header>
  )
}
