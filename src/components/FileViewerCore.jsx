import { useState, useRef, useCallback, useEffect, useLayoutEffect, memo, forwardRef, useImperativeHandle } from 'react'
import { processFile, ACCEPT, EXT_LABEL } from '../utils/fileProcessor'
import { saveFile, getAllFiles, deleteFile } from '../utils/fileStore'
import handState from '../utils/handState'
import 'highlight.js/styles/atom-one-dark.css'
import * as pdfjsLib from 'pdfjs-dist'
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

// ── 렌더 화질 배율: 화면 픽셀 밀도(레티나 등)에 맞춰 선명하게.
//    fitScale(=CSS 표시 크기)에 이 배율을 곱해 캔버스 내부 해상도를 높인다.
//    줌(최대 4배) 시 흐려짐도 완화하기 위해 최소 2배 보장, 메모리 고려해 3.5배 상한.
const PDF_RENDER_SCALE = Math.min(3.5, Math.max(2, window.devicePixelRatio || 1))

// ── PDF 페이지 단위 렌더러 (memo: fitScale/pdfDoc 변경 시에만 재렌더)
const PdfPage = memo(function PdfPage({ pdfDoc, pageNum, fitScale }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !fitScale) return
    let task = null
    ;(async () => {
      const page        = await pdfDoc.getPage(pageNum)
      const cssViewport = page.getViewport({ scale: fitScale })
      const viewport    = page.getViewport({ scale: fitScale * PDF_RENDER_SCALE })
      const canvas      = canvasRef.current
      if (!canvas) return
      canvas.width        = Math.floor(viewport.width)
      canvas.height       = Math.floor(viewport.height)
      canvas.style.width  = `${Math.floor(cssViewport.width)}px`
      canvas.style.height = `${Math.floor(cssViewport.height)}px`
      const ctx = canvas.getContext('2d', { alpha: false })
      task = page.render({ canvasContext: ctx, viewport })
      await task.promise
    })()
    return () => { task?.cancel?.() }
  }, [pdfDoc, pageNum, fitScale])
  return <canvas ref={canvasRef} className="fv-pdf-canvas" />
})

// ── PDF 뷰어: forwardRef로 줌·스크롤을 명령형으로 제어 (zoom prop 없음 → React 리렌더 없음)
const PdfViewer = forwardRef(function PdfViewer({ url }, ref) {
  const [numPages,  setNumPages]  = useState(0)
  const [pdfDoc,    setPdfDoc]    = useState(null)
  const [fitScale,  setFitScale]  = useState(null)
  const containerRef = useRef(null)
  const innerRef     = useRef(null)
  const spacerRef    = useRef(null)
  const vp1Ref       = useRef(null)
  const totalHRef    = useRef(0)

  // PDF 로드
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

  // pdfDoc 세팅 후 컨테이너 크기로 fitScale 계산
  useEffect(() => {
    if (!pdfDoc || !vp1Ref.current) return
    const vp1 = vp1Ref.current
    const el  = containerRef.current
    const availH = (el?.clientHeight ?? (window.innerHeight - 192)) - 16
    const availW = (el?.clientWidth  ?? (window.innerWidth * 0.75 - 96)) - 16
    setFitScale(Math.min(availH / vp1.height, availW / vp1.width))
  }, [pdfDoc])

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0
  }, [url])

  // totalH를 렌더마다 ref에 동기화 (setZoom에서 사용)
  const pageH = vp1Ref.current && fitScale ? vp1Ref.current.height * fitScale : 0
  const totalH = numPages > 0 && pageH > 0
    ? numPages * pageH + (numPages - 1) * 8 + 16
    : 0
  totalHRef.current = totalH

  // 명령형 API: FileViewerCore의 단일 RAF에서 직접 호출
  useImperativeHandle(ref, () => ({
    setZoom(zoom) {
      if (innerRef.current)
        innerRef.current.style.transform = `scale(${zoom})`
      if (spacerRef.current)
        spacerRef.current.style.height = zoom > 1 && totalHRef.current > 0
          ? `${totalHRef.current * (zoom - 1)}px` : '0px'
    },
    scrollBy(dy) {
      if (containerRef.current) containerRef.current.scrollTop += dy
    },
  }), [])

  return (
    <div ref={containerRef} className="fv-pdf-pages">
      {!fitScale || numPages === 0
        ? <span className="fv-pdf-loading">Loading…</span>
        : <>
            <div ref={innerRef} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '8px', padding: '8px 0',
              transform: 'scale(1)', transformOrigin: 'top center',
            }}>
              {Array.from({ length: numPages }, (_, i) => (
                <PdfPage key={i} pdfDoc={pdfDoc} pageNum={i + 1} fitScale={fitScale} />
              ))}
            </div>
            <div ref={spacerRef} style={{ height: '0px' }} />
          </>
      }
    </div>
  )
})

const SIDEBAR_X = 0.27
const DROP_X    = 0.30

function FileContent({ file, pdfRef }) {
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
    return <PdfViewer url={file.url} ref={pdfRef} />
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

  const [pinchDragging,  setPinchDragging]  = useState(null)
  const [pinchDropReady, setPinchDropReady] = useState(false)
  const [pinchDragPos,   setPinchDragPos]   = useState({ x: 0, y: 0 })

  // ── 줌: state 제거 → ref + 직접 DOM 조작으로 리렌더 차단
  const contentZoomRef    = useRef(1)
  const mediaWrapperRef   = useRef(null)  // 이미지·영상·오디오 wrapper
  const textInnerRef      = useRef(null)  // 텍스트 inner div
  const textSpacerRef     = useRef(null)  // 텍스트 spacer div
  const pdfViewerRef      = useRef(null)  // PdfViewer 명령형 ref
  const textHRef          = useRef(0)     // 텍스트 자연 높이 (측정값)

  const activeIdxRef      = useRef(activeIdx)
  activeIdxRef.current    = activeIdx
  const renderedScrollRef = useRef(null)
  const renderedLastYRef  = useRef(null)
  const pdfLastYRef       = useRef(null)

  const inputRef          = useRef(null)
  const urlsRef           = useRef([])
  const fileListRef       = useRef(null)
  const fileItemRectsRef  = useRef([])  // pinch drag: DOM 쿼리 캐시
  const pinchDraggingRef  = useRef(null)
  const prevPinchRef      = useRef(false)
  const dropReadyRef      = useRef(false)
  const filesRef          = useRef(files)
  filesRef.current = files

  // ── 줌을 직접 DOM에 적용하는 함수
  const applyZoom = useCallback((file, zoom) => {
    if (!file) return
    if (['image', 'video', 'audio'].includes(file.type)) {
      if (mediaWrapperRef.current)
        mediaWrapperRef.current.style.transform = `scale(${zoom})`
    } else if (file.type !== 'pdf') {
      if (textInnerRef.current)
        textInnerRef.current.style.transform = `scale(${zoom})`
      if (textSpacerRef.current)
        textSpacerRef.current.style.height = zoom > 1 && textHRef.current > 0
          ? `${textHRef.current * (zoom - 1)}px` : '0px'
    } else {
      pdfViewerRef.current?.setZoom(zoom)
    }
  }, [])

  // ── 파일 전환 시 줌·스크롤 초기화
  useEffect(() => {
    contentZoomRef.current = 1
    applyZoom(filesRef.current[activeIdx], 1)
    if (renderedScrollRef.current) renderedScrollRef.current.scrollTop = 0
    renderedLastYRef.current = null
    pdfLastYRef.current      = null
    textHRef.current         = 0
    fileItemRectsRef.current = []  // 파일 목록 rect 캐시 무효화
  }, [activeIdx, applyZoom])

  // ── 텍스트 자연 높이 측정 (파일 전환·마운트 시만)
  useLayoutEffect(() => {
    if (textInnerRef.current)
      textHRef.current = textInnerRef.current.offsetHeight
  }, [activeIdx])

  // ── 단일 통합 RAF: 줌 + 스크롤 + 핀치 드래그 → RAF 4개 → 1개
  useEffect(() => {
    let rafId
    const SCROLL_TYPES = new Set(['image', 'video', 'audio'])

    function poll() {
      const viewerOpen = handState.dismissed && handState.dismissDir === 'left'
      const file       = filesRef.current[activeIdxRef.current]
      const zooming    = handState.bothZoomActive

      // ── 줌 (직접 DOM 조작, React setState 없음)
      if (viewerOpen && handState.zoomDelta !== 0 && zooming) {
        const next = Math.max(1, Math.min(4, contentZoomRef.current + handState.zoomDelta * 3))
        contentZoomRef.current = next
        handState.zoomDelta = 0
        applyZoom(file, next)
      }

      // ── 스크롤 (파일 뷰어가 열려있고, 줌 중이 아닐 때)
      if (viewerOpen && !zooming) {
        const useIndex  = handState.indexPinchActive
        const useScroll = !useIndex && handState.activePinch
        const active    = useIndex || useScroll
        const px        = useIndex ? handState.indexPinchMidX : handState.pinchMidX
        const py        = useIndex ? handState.indexPinchMidY : handState.pinchMidY

        if (file && active && px > DROP_X) {
          if (file.type === 'pdf') {
            if (pdfLastYRef.current !== null)
              pdfViewerRef.current?.scrollBy((py - pdfLastYRef.current) * window.innerHeight * 2.2)
            pdfLastYRef.current      = py
            renderedLastYRef.current = null
          } else if (!SCROLL_TYPES.has(file.type)) {
            const el = renderedScrollRef.current
            if (el && renderedLastYRef.current !== null)
              el.scrollTop += (py - renderedLastYRef.current) * window.innerHeight * 2.2
            renderedLastYRef.current = py
            pdfLastYRef.current      = null
          } else {
            renderedLastYRef.current = null
            pdfLastYRef.current      = null
          }
        } else {
          renderedLastYRef.current = null
          pdfLastYRef.current      = null
        }
      } else if (!viewerOpen) {
        renderedLastYRef.current = null
        pdfLastYRef.current      = null
      }

      // ── 핀치 드래그 (사이드바 파일 → 메인 열기)
      const px     = handState.indexPinchMidX
      const py     = handState.indexPinchMidY
      const active = handState.indexPinchActive

      if (active) {
        if (pinchDraggingRef.current === null && px < SIDEBAR_X && filesRef.current.length > 0) {
          // rect 캐시: 없으면 측정, 있으면 재사용
          if (!fileItemRectsRef.current.length) {
            const items = fileListRef.current?.querySelectorAll('.fv-file-item')
            if (items) {
              fileItemRectsRef.current = Array.from(items).map(el => {
                const r = el.getBoundingClientRect()
                return { top: r.top / window.innerHeight, bottom: r.bottom / window.innerHeight }
              })
            }
          }
          for (let i = 0; i < fileItemRectsRef.current.length; i++) {
            const { top, bottom } = fileItemRectsRef.current[i]
            if (py >= top - 0.01 && py <= bottom + 0.01) {
              pinchDraggingRef.current = i
              setPinchDragging(i)
              break
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
        if (prevPinchRef.current && pinchDraggingRef.current !== null) {
          if (dropReadyRef.current) setActiveIdx(pinchDraggingRef.current)
          pinchDraggingRef.current = null
          dropReadyRef.current     = false
          setPinchDragging(null)
          setPinchDropReady(false)
          fileItemRectsRef.current = []  // 드롭 후 캐시 초기화
        }
        prevPinchRef.current = false
      }

      rafId = requestAnimationFrame(poll)
    }
    rafId = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(rafId)
  }, [applyZoom])

  useEffect(() => {
    const urls = urlsRef.current
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [])

  // ── 새로고침 후 IndexedDB에 저장된 파일 복원
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const stored = await getAllFiles()
      if (cancelled || !stored.length) return
      setLoading(true)
      const restored = await Promise.all(stored.map(async (s) => {
        const file = new File([s.blob], s.name)
        const r    = await processFile(file)
        if (r.url) urlsRef.current.push(r.url)
        return { ...r, _id: s.id }
      }))
      if (cancelled) return
      setFiles(restored)
      setActiveIdx(restored.length - 1)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const handleFiles = useCallback(async (fileList) => {
    if (!fileList?.length) return
    setLoading(true)
    const originals = Array.from(fileList)
    const results   = await Promise.all(originals.map(processFile))
    const withIds   = results.map((r) => {
      if (r.url) urlsRef.current.push(r.url)
      return { ...r, _id: `${Date.now()}-${Math.random().toString(36).slice(2)}` }
    })
    // 원본 파일을 IndexedDB에 저장 (새로고침 후 복원용)
    await Promise.all(withIds.map((r, i) => saveFile(r._id, originals[i])))
    setFiles(prev => {
      const next = [...prev, ...withIds]
      setActiveIdx(next.length - 1)
      return next
    })
    setLoading(false)
    fileItemRectsRef.current = []  // 파일 추가 후 캐시 무효화
  }, [])

  const onDrop      = useCallback(e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }, [handleFiles])
  const onDragOver  = useCallback(e => { e.preventDefault(); setDragging(true)  }, [])
  const onDragLeave = useCallback(() => setDragging(false), [])

  const removeFile = useCallback((idx, e) => {
    e.stopPropagation()
    setFiles(prev => {
      const f = prev[idx]
      if (f?.url) URL.revokeObjectURL(f.url)
      if (f?._id) deleteFile(f._id)  // IndexedDB에서도 제거
      const next = prev.filter((_, i) => i !== idx)
      setActiveIdx(Math.max(0, Math.min(activeIdx, next.length - 1)))
      return next
    })
    fileItemRectsRef.current = []
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
                onClick={() => { setActiveIdx(i); fileItemRectsRef.current = [] }}
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
                {['image', 'video', 'audio'].includes(active.type)
                  ? (
                    <div
                      ref={mediaWrapperRef}
                      style={{
                        display: 'flex', flexDirection: 'column',
                        width: '100%', height: '100%',
                        transform: 'scale(1)',
                        transformOrigin: 'center center',
                        transition: 'transform 0.05s',
                      }}
                    >
                      <FileContent file={active} pdfRef={pdfViewerRef} />
                    </div>
                  )
                  : active.type !== 'pdf'
                    ? (
                      <div ref={renderedScrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
                        <div
                          ref={textInnerRef}
                          style={{ transform: 'scale(1)', transformOrigin: 'top left' }}
                        >
                          <FileContent file={active} pdfRef={pdfViewerRef} />
                        </div>
                        <div ref={textSpacerRef} style={{ height: '0px' }} />
                      </div>
                    )
                    : (
                      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                        <FileContent file={active} pdfRef={pdfViewerRef} />
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
