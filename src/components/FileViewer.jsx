import { useState, useEffect, useRef } from 'react'
import handState from '../utils/handState'
import FileViewerCore from './FileViewerCore'
import '../styles/file-viewer.css'

export default function FileViewer() {
  const [visible,  setVisible]  = useState(false)
  const visibleRef = useRef(false)

  useEffect(() => {
    let rafId
    function poll() {
      const show = handState.dismissed && handState.dismissDir === 'left'
      if (show !== visibleRef.current) {
        visibleRef.current = show
        setVisible(show)
      }
      rafId = requestAnimationFrame(poll)
    }
    rafId = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <div className={`file-viewer${visible ? ' file-viewer--visible' : ''}`}>
      <FileViewerCore />
    </div>
  )
}
