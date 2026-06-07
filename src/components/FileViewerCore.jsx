import { useState, useRef, useCallback, useEffect } from 'react'
import { processFile, ACCEPT, EXT_LABEL } from '../utils/fileProcessor'
import 'highlight.js/styles/atom-one-dark.css'

function FileContent({ file }) {
  if (file.type === 'image') {
    return <div className="fv-media-center"><img src={file.url} alt={file.name} className="fv-media-img" /></div>
  }
  if (file.type === 'video') {
    return (
      <div className="fv-media-center">
        <video controls className="fv-media-video">
          <source src={file.url} type={file.mime} />
        </video>
      </div>
    )
  }
  if (file.type === 'audio') {
    return (
      <div className="fv-audio-wrap">
        <span className="fv-audio-name">{file.name}</span>
        <audio controls className="fv-media-audio">
          <source src={file.url} type={file.mime} />
        </audio>
      </div>
    )
  }
  if (file.type === 'pdf') {
    return <iframe src={file.url} className="fv-media-pdf" title={file.name} />
  }
  return (
    <div
      className={`fv-rendered fv-rendered--${file.ext}`}
      dangerouslySetInnerHTML={{ __html: file.html }}
    />
  )
}

export default function FileViewerCore() {
  const [files,     setFiles]     = useState([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [dragging,  setDragging]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const inputRef = useRef(null)
  const urlsRef  = useRef([])

  // 컴포넌트 언마운트 시 ObjectURL 해제
  useEffect(() => {
    const urls = urlsRef.current
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [])

  const handleFiles = useCallback(async (fileList) => {
    if (!fileList?.length) return
    setLoading(true)
    const results = await Promise.all(Array.from(fileList).map(processFile))
    results.forEach(r => { if (r.url) urlsRef.current.push(r.url) })
    setFiles(prev => {
      const next = [...prev, ...results]
      setActiveIdx(next.length - 1)
      return next
    })
    setLoading(false)
  }, [])

  const onDrop      = useCallback(e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }, [handleFiles])
  const onDragOver  = useCallback(e => { e.preventDefault(); setDragging(true)  }, [])
  const onDragLeave = useCallback(() => setDragging(false), [])

  const removeFile = useCallback((idx, e) => {
    e.stopPropagation()
    setFiles(prev => {
      const f = prev[idx]
      if (f?.url) URL.revokeObjectURL(f.url)
      const next = prev.filter((_, i) => i !== idx)
      setActiveIdx(Math.max(0, Math.min(activeIdx, next.length - 1)))
      return next
    })
  }, [activeIdx])

  const active = files[activeIdx]

  return (
    <>
      {/* ── 사이드바 ── */}
      <div className="fv-sidebar">
        <div
          className={`fv-dropzone${dragging ? ' fv-dropzone--over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          {loading
            ? <span className="fv-hint">Loading…</span>
            : <>
                <span className="fv-drop-arrow">↑</span>
                <span className="fv-hint">Drop or click</span>
              </>
          }
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />

        {files.length > 0 && (
          <div className="fv-file-list">
            {files.map((f, i) => (
              <div
                key={i}
                className={`fv-file-item${i === activeIdx ? ' fv-file-item--active' : ''}`}
                onClick={() => setActiveIdx(i)}
              >
                <span className="fv-file-tag">{EXT_LABEL[f.ext] ?? f.ext.toUpperCase()}</span>
                <span className="fv-file-name" title={f.name}>
                  {f.name.replace(/\.[^.]+$/, '')}
                </span>
                <button className="fv-file-remove" onClick={e => removeFile(i, e)} title="Remove">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 메인 콘텐츠 ── */}
      <div className="fv-main">
        {!active
          ? (
            <div className="fv-empty-state">
              <span className="fv-empty-icon">□</span>
              <span className="fv-empty-label">No file selected</span>
              <span className="fv-empty-sub">Drop a file to preview it here</span>
            </div>
          )
          : (
            <>
              <div className="fv-content-header">
                <span className="fv-content-name">{active.name}</span>
              </div>
              <div className="fv-content-body">
                <FileContent file={active} />
              </div>
            </>
          )
        }
      </div>
    </>
  )
}
