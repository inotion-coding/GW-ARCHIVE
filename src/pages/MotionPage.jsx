import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import handState from '../utils/handState'
import '../styles/motion-page.css'

const CARDS = [
  { id: 1,  title: 'Hand Gesture'  },
  { id: 2,  title: 'Body Pose'     },
  { id: 3,  title: 'Eye Tracking'  },
  { id: 4,  title: 'Face Mesh'     },
  { id: 5,  title: 'Pinch Control' },
  { id: 6,  title: 'Wrist Motion'  },
  { id: 7,  title: 'Zoom Gesture'  },
  { id: 8,  title: 'Swipe Control' },
  { id: 9,  title: 'Fist Detect'   },
  { id: 10, title: 'Dual Hand'     },
]

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
