import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import handState from '../utils/handState'
import '../styles/motion-page.css'

// public/docs/ 의 실제 파일명(ASCII) ↔ 사용자에게 저장될 한글 파일명
const FILES = [
  { src: 'proposal-application.pdf', name: '제안신청서.pdf' },
  { src: 'proposal-description.pdf', name: '제안설명서.pdf' },
  { src: 'privacy-consent.pdf',      name: '개인정보동의서.pdf' },
]

function download({ src, name }) {
  const a = document.createElement('a')
  a.href = `${import.meta.env.BASE_URL}docs/${src}`
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export default function DownloadsPage() {
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

  // 연속 다운로드는 브라우저가 차단할 수 있어 간격을 둠
  const downloadAll = () => {
    FILES.forEach((f, i) => setTimeout(() => download(f), i * 400))
  }

  return (
    <div className="motion-page">
      <button className="motion-back" onClick={() => navigate('/')}>←</button>

      <p className="motion-site-label">PDF · {FILES.length} files</p>
      <h1 className="motion-title">Downloads</h1>

      <ul className="dl-list">
        {FILES.map(f => (
          <li key={f.src}>
            <button className="dl-item" onClick={() => download(f)}>
              <span className="dl-item-name">{f.name}</span>
              <span className="dl-item-icon">↓</span>
            </button>
          </li>
        ))}
      </ul>

      <button className="motion-launch-btn" onClick={downloadAll}>
        전체 다운로드 ↓
      </button>
    </div>
  )
}
