import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import handState from '../utils/handState'
import FileViewerCore from '../components/FileViewerCore'
import '../styles/file-viewer.css'
import '../styles/file-viewer-page.css'

export default function FileViewerPage() {
  const navigate = useNavigate()

  useEffect(() => {
    let rafId
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
    <div className="fvp-root">
      <button className="fvp-back" onClick={() => navigate('/')}>← Back</button>
      <FileViewerCore />
    </div>
  )
}
