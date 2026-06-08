import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import handState from '../utils/handState'
import '../styles/motion-page.css'

const URL = 'https://www.megastudy.net'

export default function MegastudyPage() {
  const navigate = useNavigate()

  useEffect(() => {
    let rafId
    function poll() {
      if (handState.back) { handState.back = false; navigate('/'); return }
      rafId = requestAnimationFrame(poll)
    }
    rafId = requestAnimationFrame(poll)
    return () => { cancelAnimationFrame(rafId); handState.back = false }
  }, [navigate])

  return (
    <div className="motion-page">
      <button className="motion-back" onClick={() => navigate('/')}>←</button>

      <p className="motion-site-label">megastudy.net</p>
      <h1 className="motion-title">Megastudy</h1>

      <button
        className="motion-launch-btn"
        onClick={() => window.open(URL, '_blank', 'noopener,noreferrer')}
      >
        사이트 열기 →
      </button>
    </div>
  )
}
