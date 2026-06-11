import { useState, useEffect } from 'react'

/**
 * 최초 접속 시 'GW ARCHIVE' 문구를 보여준 뒤 웹으로 전환되는 인트로 스플래시.
 * phase: show(노출) → fade(페이드아웃) → done(언마운트)
 */
export default function Intro() {
  const [phase, setPhase] = useState('show')

  useEffect(() => {
    const tFade = setTimeout(() => setPhase('fade'), 1500)
    const tDone = setTimeout(() => setPhase('done'), 2200)
    return () => {
      clearTimeout(tFade)
      clearTimeout(tDone)
    }
  }, [])

  if (phase === 'done') return null

  return (
    <div className={`intro-splash${phase === 'fade' ? ' intro-splash--hide' : ''}`}>
      <span className="intro-title">GW ARCHIVE</span>
    </div>
  )
}
