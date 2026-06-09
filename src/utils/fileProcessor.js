// ── 확장자 분류 세트
export const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','svg','bmp','ico'])
export const VIDEO_EXTS = new Set(['mp4','webm','mov','avi','mkv'])
export const AUDIO_EXTS = new Set(['mp3','wav','flac','aac','ogg','m4a'])
export const SHEET_EXTS = new Set(['xlsx','xls','ods','csv'])
export const CODE_EXTS  = new Set([
  'js','jsx','ts','tsx','vue','svelte',
  'css','scss','sass','less',
  'html','htm','xml','json','yaml','yml','toml','ini','env',
  'py','java','c','cpp','h','hpp','cs','go','rs','rb','php',
  'sh','bash','zsh','sql','kt','swift','dart','r','lua','ps1','psm1',
])

export const ACCEPT = [
  '.md','.txt','.log','.rtf',
  '.doc','.docx','.odt','.hwpx','.hwp',
  '.pdf',
  '.xlsx','.xls','.ods','.csv',
  '.pptx','.odp',
  '.epub',
  '.jpg','.jpeg','.png','.gif','.webp','.svg','.bmp','.ico',
  '.mp4','.webm','.mov','.avi',
  '.mp3','.wav','.flac','.aac','.ogg','.m4a',
  '.js','.jsx','.ts','.tsx','.vue','.svelte',
  '.css','.scss','.sass','.less',
  '.html','.htm','.xml','.json','.yaml','.yml','.toml','.ini','.env',
  '.py','.java','.c','.cpp','.h','.cs','.go','.rs','.rb','.php',
  '.sh','.bash','.sql','.kt','.swift','.dart','.r','.lua','.ps1',
].join(',')

export const EXT_LABEL = {
  md:'MD', txt:'TXT', log:'LOG', rtf:'RTF',
  doc:'DOC', docx:'DOC', odt:'ODT', hwpx:'HWPX', hwp:'HWP',
  pdf:'PDF',
  xlsx:'XLS', xls:'XLS', ods:'ODS', csv:'CSV',
  pptx:'PPT', odp:'ODP', epub:'EPUB',
  jpg:'IMG', jpeg:'IMG', png:'IMG', gif:'IMG', webp:'IMG', svg:'SVG', bmp:'IMG', ico:'ICO',
  mp4:'VID', webm:'VID', mov:'VID', avi:'VID',
  mp3:'AUD', wav:'AUD', flac:'AUD', aac:'AUD', ogg:'AUD', m4a:'AUD',
  js:'JS', jsx:'JSX', ts:'TS', tsx:'TSX', vue:'VUE', svelte:'SVE',
  css:'CSS', scss:'SCSS', sass:'SASS', less:'LESS',
  html:'HTML', htm:'HTML', xml:'XML', json:'JSON', yaml:'YAML', yml:'YAML',
  toml:'TOML', ini:'INI', env:'ENV',
  py:'PY', java:'JAVA', c:'C', cpp:'C++', h:'H', hpp:'H++', cs:'C#',
  go:'GO', rs:'RS', rb:'RB', php:'PHP', sh:'SH', bash:'SH', zsh:'SH',
  sql:'SQL', kt:'KT', swift:'SWIFT', dart:'DART', r:'R', lua:'LUA', ps1:'PS1',
}

const VIDEO_MIME = {
  mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime', avi:'video/x-msvideo',
}
const AUDIO_MIME = {
  mp3:'audio/mpeg', wav:'audio/wav', flac:'audio/flac', aac:'audio/aac', ogg:'audio/ogg', m4a:'audio/mp4',
}

const LANG_MAP = {
  js:'javascript', jsx:'javascript', ts:'typescript', tsx:'typescript',
  py:'python', rb:'ruby', rs:'rust', go:'go', java:'java', kt:'kotlin',
  cs:'csharp', c:'c', cpp:'cpp', h:'c', hpp:'cpp',
  php:'php', swift:'swift', dart:'dart', r:'r',
  html:'html', htm:'html', xml:'xml', svg:'xml',
  json:'json', yaml:'yaml', yml:'yaml', toml:'ini', ini:'ini', env:'ini',
  css:'css', scss:'scss', sass:'scss', less:'less',
  sh:'bash', bash:'bash', zsh:'bash', ps1:'powershell', psm1:'powershell',
  sql:'sql', lua:'lua', vue:'xml', svelte:'xml',
}

async function highlightCode(code, ext) {
  const { default: hljs } = await import('highlight.js/lib/common')
  const lang = LANG_MAP[ext]
  try {
    const result = lang
      ? hljs.highlight(code, { language: lang, ignoreIllegals: true })
      : hljs.highlightAuto(code)
    return `<pre class="fv-code"><code class="hljs">${result.value}</code></pre>`
  } catch {
    return `<pre class="fv-code"><code>${code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>`
  }
}

function extractDocText(buffer) {
  const bytes = new Uint8Array(buffer)
  if (bytes[0] === 0x50 && bytes[1] === 0x4B) return null
  if (bytes[0] !== 0xD0 || bytes[1] !== 0xCF) return null
  const texts = []
  let run = []
  for (let i = 512; i < bytes.length - 1; i += 2) {
    const cp = bytes[i] | (bytes[i + 1] << 8)
    const ok = (cp >= 0x0020 && cp <= 0x007E)
      || (cp >= 0x00C0 && cp <= 0x024F)
      || (cp >= 0x0400 && cp <= 0x04FF)
      || (cp >= 0x4E00 && cp <= 0x9FFF)
      || (cp >= 0xAC00 && cp <= 0xD7A3)
      || cp === 0x000A || cp === 0x000D
    if (ok) {
      run.push(cp === 0x000D ? '' : String.fromCharCode(cp))
    } else {
      if (run.length >= 8) {
        const s = run.join('').trim()
        const letters = (s.match(/[a-zA-Z가-힣一-鿿Ѐ-ӿ]/g) ?? []).length
        if (letters / s.length > 0.38) texts.push(s)
      }
      run = []
    }
  }
  if (run.length >= 8) {
    const s = run.join('').trim()
    const letters = (s.match(/[a-zA-Z가-힣一-鿿Ѐ-ӿ]/g) ?? []).length
    if (letters / s.length > 0.38) texts.push(s)
  }
  return texts.length ? texts : null
}

function parseRtf(raw) {
  let s = raw
  s = s.replace(/\{[^{}]*\}/g, '')
  s = s.replace(/\\par\r?\n?/g, '\n').replace(/\\line\b/g, '\n').replace(/\\tab\b/g, '\t')
  s = s.replace(/\\[a-z*]+\d*[ ]?/gi, '').replace(/[{}\\]/g, '')
  s = s.replace(/\n{3,}/g, '\n\n').trim()
  return s
    ? `<pre class="fv-plain">${s.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>`
    : '<p class="fv-empty-msg">No content</p>'
}

function parsePptxXml(xml, slideNum) {
  const results = []
  const paraRe = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g
  let pm
  while ((pm = paraRe.exec(xml)) !== null) {
    const textRe = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g
    const words = []; let tm
    while ((tm = textRe.exec(pm[1])) !== null) {
      const t = tm[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').trim()
      if (t) words.push(t)
    }
    if (words.length) results.push(words.join(''))
  }
  if (!results.length) return ''
  return `<div class="fv-slide"><div class="fv-slide-num">Slide ${slideNum}</div>${results.map(p=>`<p>${p}</p>`).join('')}</div>`
}

async function parseHwpx(zip) {
  const keys = Object.keys(zip.files)
    .filter(k => /^Contents\/section\d+\.xml$/i.test(k))
    .sort((a, b) => parseInt(a.match(/(\d+)/)[1]) - parseInt(b.match(/(\d+)/)[1]))
  if (!keys.length) return '<p class="fv-empty-msg">No sections found</p>'
  const parts = []
  for (let i = 0; i < keys.length; i++) {
    const xml = await zip.files[keys[i]].async('string')
    const paras = []
    const paraRe = /<hp:p\b[^>]*>([\s\S]*?)<\/hp:p>/g
    let pm
    while ((pm = paraRe.exec(xml)) !== null) {
      const text = pm[1].replace(/<[^>]+>/g, '')
        .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').trim()
      if (text) paras.push(text)
    }
    if (paras.length)
      parts.push(`<div class="fv-slide"><div class="fv-slide-num">Section ${i+1}</div>${paras.map(p=>`<p>${p}</p>`).join('')}</div>`)
  }
  return parts.join('') || '<p class="fv-empty-msg">No text found</p>'
}

async function parseOpenDocument(zip, ext) {
  const xml = await zip.files['content.xml']?.async('string')
  if (!xml) return '<p class="fv-empty-msg">content.xml not found</p>'
  if (ext === 'odp') {
    const slides = []; let n = 0
    const slideRe = /<draw:page[^>]*>([\s\S]*?)<\/draw:page>/g
    let sm
    while ((sm = slideRe.exec(xml)) !== null) {
      n++
      const text = sm[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')
        .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').trim()
      if (text) slides.push(`<div class="fv-slide"><div class="fv-slide-num">Slide ${n}</div><p>${text}</p></div>`)
    }
    return slides.join('') || '<p class="fv-empty-msg">No text found</p>'
  }
  const paras = []
  const paraRe = /<text:p[^>]*>([\s\S]*?)<\/text:p>/g
  let pm
  while ((pm = paraRe.exec(xml)) !== null) {
    const text = pm[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')
      .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').trim()
    if (text) paras.push(text)
  }
  return paras.map(p=>`<p>${p}</p>`).join('') || '<p class="fv-empty-msg">No text found</p>'
}

async function parseEpub(zip) {
  const container = await zip.files['META-INF/container.xml']?.async('string')
  if (!container) return '<p class="fv-empty-msg">container.xml not found</p>'
  const opfMatch = container.match(/full-path="([^"]+\.opf)"/)
  if (!opfMatch) return '<p class="fv-empty-msg">OPF not found</p>'
  const opfPath = opfMatch[1]
  const opfDir  = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
  const opf     = await zip.files[opfPath]?.async('string')
  if (!opf) return '<p class="fv-empty-msg">Failed to read OPF</p>'
  const manifest = {}
  const mRe = /<item[^>]+id="([^"]+)"[^>]+href="([^"]+)"/g; let mm
  while ((mm = mRe.exec(opf)) !== null) manifest[mm[1]] = mm[2]
  const spine = []
  const sRe = /<itemref[^>]+idref="([^"]+)"/g; let sm
  while ((sm = sRe.exec(opf)) !== null) if (manifest[sm[1]]) spine.push(manifest[sm[1]])
  const parts = []
  for (const href of spine.slice(0, 40)) {
    const html = await zip.files[opfDir + href]?.async('string')
               ?? await zip.files[href]?.async('string')
    if (!html) continue
    const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i) ?? [,''])[1]
    const clean = body
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<\/(p|h[1-6]|li|blockquote|div)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
      .replace(/\n{3,}/g, '\n\n').trim()
    if (clean) {
      const pars = clean.split('\n').filter(l=>l.trim()).map(l=>`<p>${l.trim()}</p>`).join('')
      parts.push(`<div class="fv-epub-chapter">${pars}</div>`)
    }
  }
  return parts.join('<div class="fv-sheet-sep"></div>') || '<p class="fv-empty-msg">No content</p>'
}

export async function processFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()

  if (IMAGE_EXTS.has(ext))
    return { name: file.name, ext, type: 'image', url: URL.createObjectURL(file) }
  if (VIDEO_EXTS.has(ext))
    return { name: file.name, ext, type: 'video', url: URL.createObjectURL(file), mime: VIDEO_MIME[ext] ?? 'video/mp4' }
  if (AUDIO_EXTS.has(ext))
    return { name: file.name, ext, type: 'audio', url: URL.createObjectURL(file), mime: AUDIO_MIME[ext] ?? 'audio/mpeg' }
  if (ext === 'pdf')
    return { name: file.name, ext, type: 'pdf', url: URL.createObjectURL(file) }

  try {
    if (ext === 'md') {
      const { marked } = await import('marked')
      return { name: file.name, ext, type: 'html', html: marked.parse(await file.text()) }
    }
    if (ext === 'txt' || ext === 'log') {
      const text = await file.text()
      return { name: file.name, ext, type: 'html', html: `<pre class="fv-plain">${text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>` }
    }
    if (ext === 'rtf') {
      return { name: file.name, ext, type: 'html', html: parseRtf(await file.text()) }
    }
    if (CODE_EXTS.has(ext)) {
      return { name: file.name, ext, type: 'html', html: await highlightCode(await file.text(), ext) }
    }
    if (ext === 'docx') {
      const { default: mammoth } = await import('mammoth/mammoth.browser')
      const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
      return { name: file.name, ext, type: 'html', html: result.value }
    }
    if (ext === 'doc') {
      const buf = await file.arrayBuffer()
      const sig = new Uint8Array(buf, 0, 2)
      if (sig[0] === 0x50 && sig[1] === 0x4B) {
        const { default: mammoth } = await import('mammoth/mammoth.browser')
        const result = await mammoth.convertToHtml({ arrayBuffer: buf })
        return { name: file.name, ext, type: 'html', html: result.value }
      }
      const texts = extractDocText(buf)
      if (!texts) {
        return { name: file.name, ext, type: 'html', html: '<p class="fv-err">Could not read this .doc file.<br>Please save it as <strong>.docx</strong> and try again.</p>' }
      }
      const html = texts.map(t => `<p>${t.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`).join('')
      return { name: file.name, ext, type: 'html', html: `<div class="fv-doc-plain">${html}</div>` }
    }
    if (SHEET_EXTS.has(ext)) {
      const XLSX = await import('xlsx')
      const wb   = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' })
      const html = wb.SheetNames
        .map(n => `<div class="fv-sheet-label">${n}</div>${XLSX.utils.sheet_to_html(wb.Sheets[n], { editable: false })}`)
        .join('<div class="fv-sheet-sep"></div>')
      return { name: file.name, ext, type: 'html', html }
    }
    if (ext === 'hwp') {
      return { name: file.name, ext, type: 'html', html: '<p class="fv-err">HWP binary format cannot be parsed in the browser.<br>Please save the file as <strong>HWPX</strong> or <strong>DOCX</strong> and try again.</p>' }
    }
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    if (ext === 'pptx') {
      const keys = Object.keys(zip.files)
        .filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))
        .sort((a, b) => parseInt(a.match(/(\d+)/)[1]) - parseInt(b.match(/(\d+)/)[1]))
      const slides = await Promise.all(keys.map(async (k, i) => parsePptxXml(await zip.files[k].async('string'), i + 1)))
      return { name: file.name, ext, type: 'html', html: slides.filter(Boolean).join('') || '<p class="fv-empty-msg">No text found</p>' }
    }
    if (ext === 'hwpx') return { name: file.name, ext, type: 'html', html: await parseHwpx(zip) }
    if (ext === 'odt' || ext === 'odp') return { name: file.name, ext, type: 'html', html: await parseOpenDocument(zip, ext) }
    if (ext === 'epub') return { name: file.name, ext, type: 'html', html: await parseEpub(zip) }

    return { name: file.name, ext, type: 'html', html: '<p class="fv-empty-msg">Unsupported format</p>' }
  } catch (err) {
    return { name: file.name, ext, type: 'html', html: `<p class="fv-err">Parse error: ${err.message}</p>` }
  }
}
