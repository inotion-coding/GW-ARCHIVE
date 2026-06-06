import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import handState from '../utils/handState'
import '../styles/motion-page.css'
import { CARDS } from '../data/cards'

export default function MotionPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const card     = CARDS.find(c => c.id === Number(id))

  useEffect(() => {
    // 주먹 제스처 감지 → 캐러셀로 복귀
    let rafId = null
    function poll() {
      if (handState.back) {
        handState.back = false
        navigate('/')
        return
      }
      rafId = requestAnimationFrame(poll)
    }
    rafId = requestAnimationFrame(poll)
    return () => {
      cancelAnimationFrame(rafId)
      handState.back = false
    }
  }, [navigate])

  return (
    <div className="motion-page">
      <button className="motion-back" onClick={() => navigate('/')}>← Back</button>
      <h1 className="motion-title">{card?.title ?? 'Motion'}</h1>
      <p className="motion-desc">Motion recognition page — coming soon.</p>
    </div>
  )
}
