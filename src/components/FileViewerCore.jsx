import { useState, useRef, useCallback, useEffect, memo } from 'react'
import { processFile, ACCEPT, EXT_LABEL } from '../utils/fileProcessor'
import handState from '../utils/handState'
import 'highlight.js/styles/atom-one-dark.css'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

// ── PDF 페이지 단위 렌더러
const PdfPage = memo(function PdfPage({ pdfDoc, pageNum }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    let task = null
    ;(async () => {
      const page     = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale: 2 })
      const canvas   = canvasRef.current
      if (!canvas) return
      canvas.width   = viewport.width
      canvas.height  = viewport.height
      task = page.render({ canvasContext: canvas.getContext('2d'), viewport })
      await task.promise
    })()
    return () => { task?.cancel?.() }
  }, [pdfDoc, pageNum])

  return <canvas ref={canvasRef} className="fv-pdf-canvas" />
})

function PdfViewer({ url }) {
  const [numPages, setNumPages] = useState(0)
  const [pdfDoc,   setPdfDoc]   = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const doc = await pdfjsLib.getDocument(url).promise
      if (cancelled) return
      setPdfDoc(doc)
      setNumPages(doc.numPages)
    })()
    return () => { cancelled = true }
  }, [url])

  return (
    <div className="fv-pdf-pages">
      {numPages === 0
        ? <span className="fv-pdf-loading">Loading…</span>
        : Array.from({ length: numPages }, (_, i) => (
            <PdfPage key={i} pdfDoc={pdfDoc} pageNum={i + 1} />
          ))
      }
    </div>
  )
}

// 사이드바: 화면 25% 좌측
const SIDEBAR_X = 0.27
const DROP_X    = 0.30

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
    return <PdfViewer url={file.url} />
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

  // 핀치 드래그 상태
  const [pinchDragging,  setPinchDragging]  = useState(null)   // 드래그 중인 파일 index
  const [pinchDropReady, setPinchDropReady] = useState(false)   // 메인 영역 위에 있는지
  const [pinchDragPos,   setPinchDragPos]   = useState({ x: 0, y: 0 })

  const inputRef         = useRef(null)
  const urlsRef          = useRef([])
  const fileListRef      = useRef(null)
  const pinchDraggingRef = useRef(null)
  const prevPinchRef     = useRef(false)
  const dropReadyRef     = useRef(false)
  const filesRef         = useRef(files)
  filesRef.current = files

  // 컴포넌트 언마운트 시 ObjectURL 해제
  useEffect(() => {
    const urls = urlsRef.current
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [])

  // 엄지+검지 핀치 드래그: 사이드바 파일 → 메인 영역에 드롭하여 열기
  useEffect(() => {
    let rafId
    function poll() {
      const px     = handState.indexPinchMidX
      const py     = handState.indexPinchMidY
      const active = handState.indexPinchActive

      if (active) {
        // 사이드바 영역에서 파일 잡기
        if (pinchDraggingRef.current === null && px < SIDEBAR_X && filesRef.current.length > 0) {
          const items = fileListRef.current?.querySelectorAll('.fv-file-item')
          if (items) {
            for (let i = 0; i < items.length; i++) {
              const rect = items[i].getBoundingClientRect()
              const topY = rect.top / window.innerHeight
              const botY = rect.bottom / window.innerHeight
              if (py >= topY - 0.01 && py <= botY + 0.01) {
                pinchDraggingRef.current = i
                setPinchDragging(i)
                break
              }
            }
          }
        }

        if (pinchDraggingRef.current !== null) {
          const inDrop = px > DROP_X
          if (inDrop !== dropReadyRef.current) {
            dropReadyRef.current = inDrop
            setPinchDropReady(inDrop)
          }
          setPinchDragPos({ x: px * window.innerWidth, y: py * window.innerHeight })
        }
        prevPinchRef.current = true

      } else {
        // 핀치 해제 → 드롭
        if (prevPinchRef.current && pinchDraggingRef.current !== null) {
          if (dropReadyRef.current) {
            setActiveIdx(pinchDraggingRef.current)
          }
          pinchDraggingRef.current = null
          dropReadyRef.current     = false
          setPinchDragging(null)
          setPinchDropReady(false)
        }
        prevPinchRef.current = false
      }

      rafId = requestAnimationFrame(poll)
    }
    rafId = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(rafId)
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
          <div className="fv-file-list" ref={fileListRef}>
            {files.map((f, i) => (
              <div
                key={i}
                className={[
                  'fv-file-item',
                  i === activeIdx      ? 'fv-file-item--active'         : '',
                  i === pinchDragging  ? 'fv-file-item--pinch-dragging' : '',
                ].filter(Boolean).join(' ')}
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
      <div className={`fv-main${pinchDropReady ? ' fv-main--drop' : ''}`}>
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

      {/* ── 핀치 드래그 고스트 ── */}
      {pinchDragging !== null && files[pinchDragging] && (
        <div
          className={`fv-pinch-ghost${pinchDropReady ? ' fv-pinch-ghost--drop' : ''}`}
          style={{ left: pinchDragPos.x, top: pinchDragPos.y }}
        >
          <span className="fv-pinch-ghost-tag">
            {EXT_LABEL[files[pinchDragging].ext] ?? files[pinchDragging].ext.toUpperCase()}
          </span>
          <span className="fv-pinch-ghost-name">
            {files[pinchDragging].name.replace(/\.[^.]+$/, '')}
          </span>
        </div>
      )}
    </>
  )
}
