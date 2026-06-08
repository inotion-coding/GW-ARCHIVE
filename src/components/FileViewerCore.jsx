import { useState, useRef, useCallback, useEffect, memo } from 'react'
import { processFile, ACCEPT, EXT_LABEL } from '../utils/fileProcessor'
import handState from '../utils/handState'
import 'highlight.js/styles/atom-one-dark.css'
import * as pdfjsLib from 'pdfjs-dist'
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

// ── PDF 페이지 단위 렌더러
const PdfPage = memo(function PdfPage({ pdfDoc, pageNum, fitScale }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !fitScale) return
    let task = null
    ;(async () => {
      const page     = await pdfDoc.getPage(pageNum)
      // fitScale 기준으로 렌더, 픽셀 선명도를 위해 1.5배 오버샘플
      const viewport = page.getViewport({ scale: fitScale * 1.5 })
      const canvas   = canvasRef.current
      if (!canvas) return
      canvas.width        = viewport.width
      canvas.height       = viewport.height
      canvas.style.width  = `${viewport.width / 1.5}px`
      canvas.style.height = `${viewport.height / 1.5}px`
      task = page.render({ canvasContext: canvas.getContext('2d'), viewport })
      await task.promise
    })()
    return () => { task?.cancel?.() }
  }, [pdfDoc, pageNum, fitScale])

  return <canvas ref={canvasRef} className="fv-pdf-canvas" />
})

function PdfViewer({ url, zoom = 1 }) {
  const [numPages,  setNumPages]  = useState(0)
  const [pdfDoc,    setPdfDoc]    = useState(null)
  const [fitScale,  setFitScale]  = useState(null)
  const containerRef  = useRef(null)
  const lastPinchYRef = useRef(null)
  const vp1Ref        = useRef(null)

  // PDF 로드: 페이지 치수만 확보, fitScale은 pdfDoc 세팅 후 별도 계산
  useEffect(() => {
    let cancelled = false
    setFitScale(null); setPdfDoc(null); setNumPages(0)
    ;(async () => {
      const doc  = await pdfjsLib.getDocument({ url }).promise
      if (cancelled) return
      const page = await doc.getPage(1)
      vp1Ref.current = page.getViewport({ scale: 1 })
      setPdfDoc(doc)
      setNumPages(doc.numPages)
    })()
    return () => { cancelled = true }
  }, [url])

  // pdfDoc 세팅 후 → DOM이 렌더된 뒤 컨테이너 크기로 fitScale 계산
  useEffect(() => {
    if (!pdfDoc || !vp1Ref.current) return
    const vp1 = vp1Ref.current
    const el  = containerRef.current
    const availH = (el?.clientHeight ?? (window.innerHeight - 192)) - 16
    const availW = (el?.clientWidth  ?? (window.innerWidth * 0.75 - 96)) - 16
    setFitScale(Math.min(availH / vp1.height, availW / vp1.width))
  }, [pdfDoc])

  // URL 변경 시 스크롤 초기화
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0
  }, [url])

  // 단일 핀치 스크롤 (줌은 FileViewerCore에서 통합 처리)
  useEffect(() => {
    let rafId
    function poll() {
      const active  = handState.indexPinchActive
      const px      = handState.indexPinchMidX
      const py      = handState.indexPinchMidY
      const zooming = handState.bothZoomActive
      if (!zooming && active && px > 0.30) {
        if (lastPinchYRef.current !== null) {
          const dy = py - lastPinchYRef.current
          if (containerRef.current) containerRef.current.scrollTop += dy * window.innerHeight * 2.2
        }
        lastPinchYRef.current = py
      } else {
        lastPinchYRef.current = null
      }
      rafId = requestAnimationFrame(poll)
    }
    rafId = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <div ref={containerRef} className="fv-pdf-pages">
      {!fitScale || numPages === 0
        ? <span className="fv-pdf-loading">Loading…</span>
        : <div style={{ zoom }}>
            {Array.from({ length: numPages }, (_, i) => (
              <PdfPage key={i} pdfDoc={pdfDoc} pageNum={i + 1} fitScale={fitScale} />
            ))}
          </div>
      }
    </div>
  )
}

// 사이드바: 화면 25% 좌측
const SIDEBAR_X = 0.27
const DROP_X    = 0.30

function FileContent({ file, zoom = 1 }) {
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
    return <PdfViewer url={file.url} zoom={zoom} />
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

  const [contentZoom, setContentZoom] = useState(1)
  const contentZoomRef   = useRef(1)
  const activeIdxRef     = useRef(activeIdx)
  activeIdxRef.current   = activeIdx
  const renderedScrollRef = useRef(null)
  const renderedLastYRef  = useRef(null)

  const inputRef         = useRef(null)
  const urlsRef          = useRef([])
  const fileListRef      = useRef(null)
  const pinchDraggingRef = useRef(null)
  const prevPinchRef     = useRef(false)
  const dropReadyRef     = useRef(false)
  const filesRef         = useRef(files)
  filesRef.current = files

  // 파일 전환 시 줌·스크롤 초기화
  useEffect(() => {
    setContentZoom(1)
    contentZoomRef.current = 1
    if (renderedScrollRef.current) renderedScrollRef.current.scrollTop = 0
    renderedLastYRef.current = null
  }, [activeIdx])

  // 텍스트·문서 파일 핀치 스크롤 RAF (이미지·오디오·비디오·PDF 제외)
  useEffect(() => {
    const SCROLL_TYPES = new Set(['image', 'video', 'audio', 'pdf'])
    let rafId
    function poll() {
      const file    = filesRef.current[activeIdxRef.current]
      const isText  = file && !SCROLL_TYPES.has(file.type)
      const active  = handState.indexPinchActive
      const px      = handState.indexPinchMidX
      const py      = handState.indexPinchMidY
      const zooming = handState.bothZoomActive
      if (isText && !zooming && active && px > 0.30) {
        const el = renderedScrollRef.current
        if (el && renderedLastYRef.current !== null) {
          el.scrollTop += (py - renderedLastYRef.current) * window.innerHeight * 2.2
        }
        renderedLastYRef.current = py
      } else {
        renderedLastYRef.current = null
      }
      rafId = requestAnimationFrame(poll)
    }
    rafId = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(rafId)
  }, [])

  // 모든 파일 타입 줌 RAF (PDF 포함)
  useEffect(() => {
    let rafId
    function poll() {
      if (handState.zoomDelta !== 0 && handState.bothZoomActive) {
        const next = Math.max(1, Math.min(4, contentZoomRef.current + handState.zoomDelta * 3))
        contentZoomRef.current = next
        setContentZoom(next)
        handState.zoomDelta = 0
      }
      rafId = requestAnimationFrame(poll)
    }
    rafId = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(rafId)
  }, [])

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
                {/* 미디어(이미지·영상·오디오): transform scale로 시각적 확대 */}
                {['image', 'video', 'audio'].includes(active.type)
                  ? (
                    <div style={{
                      display: 'flex', flexDirection: 'column',
                      width: '100%', height: '100%',
                      transform: `scale(${contentZoom})`,
                      transformOrigin: 'center center',
                      transition: 'transform 0.05s',
                    }}>
                      <FileContent file={active} zoom={contentZoom} />
                    </div>
                  )
                  /* 텍스트·문서: zoom 속성을 스크롤 컨테이너 내부에 적용 → 확대 시 스크롤 범위 증가 */
                  : !['pdf'].includes(active.type)
                    ? (
                      <div ref={renderedScrollRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                        <div style={{ zoom: contentZoom }}>
                          <FileContent file={active} zoom={contentZoom} />
                        </div>
                      </div>
                    )
                  /* PDF: zoom은 PdfViewer 내부 스크롤 컨테이너 안에서 처리 */
                    : (
                      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                        <FileContent file={active} zoom={contentZoom} />
                      </div>
                    )
                }
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
