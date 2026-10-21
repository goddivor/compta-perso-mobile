// Tile layout of an operator logo, read from its SVG source (pure, no I/O).
// Owner's rule: a logo drawn on its own coloured block fills its tile (no
// white margin); any other logo stays centred on the white tile.
// Detection: the painted shapes at the start of the file (after <defs>) are
// blocks reaching the four corners of the viewBox, and the last of them has
// a fill that is neither white nor transparent.
//   → { mode: 'fill' }              block, roughly square: cover the tile
//   → { mode: 'band', bg }          block, wide or tall: full width, on its colour
//                                   when the block is a plain box (bg null: white tile)
//   → { mode: 'center' }            anything else: 78 % on the white tile

const SHAPES = /<(rect|path|polygon|circle|ellipse)\b([^>]*)>/
const COVER = 0.96 // share of each side the block must span
const SQUARE = 1.35 // max aspect ratio still treated as square

const num = (v) => (v == null ? NaN : parseFloat(v))
const attr = (attrs, name) => {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
  if (m) return m[1].trim()
  const s = attrs.match(/style\s*=\s*["']([^"']*)["']/i)
  const p = s && s[1].match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i'))
  return p ? p[1].trim() : null
}

function viewBoxOf(xml) {
  const root = xml.match(/<svg\b([^>]*)>/i)
  if (!root) return null
  const vb = attr(root[1], 'viewBox')
  if (vb) {
    const p = vb.split(/[\s,]+/).map(Number)
    if (p.length === 4 && p.every(Number.isFinite)) return { x: p[0], y: p[1], w: p[2], h: p[3] }
  }
  const w = num(attr(root[1], 'width'))
  const h = num(attr(root[1], 'height'))
  return Number.isFinite(w) && Number.isFinite(h) ? { x: 0, y: 0, w, h } : null
}

// Bounding box of the FIRST subpath's end points (control points ignored:
// enough to tell a background block from a mark; a mark made of several
// subpaths, such as a word, never counts as a block)
function pathBox(d) {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || []
  let i = 0
  let cmd = null
  let x = 0, y = 0, sx = 0, sy = 0
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let segments = 0
  const points = []
  const add = () => { points.push([x, y]); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  const n = () => parseFloat(tokens[i++])
  const ARGS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 }
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) {
      if (/[mM]/.test(tokens[i]) && Number.isFinite(minX)) break // second subpath
      cmd = tokens[i++]
    }
    if (!cmd) return null
    const lc = cmd.toLowerCase()
    const rel = cmd !== cmd.toUpperCase()
    if (lc === 'z') { x = sx; y = sy; add(); cmd = null; continue }
    segments++
    const k = ARGS[lc]
    if (k == null || i + k > tokens.length) break
    const a = Array.from({ length: k }, n)
    if (a.some((v) => !Number.isFinite(v))) return null
    if (lc === 'h') x = rel ? x + a[0] : a[0]
    else if (lc === 'v') y = rel ? y + a[0] : a[0]
    else { x = rel ? x + a[k - 2] : a[k - 2]; y = rel ? y + a[k - 1] : a[k - 1] }
    if (lc === 'm') { sx = x; sy = y; cmd = rel ? 'l' : 'L' }
    add()
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY, segments, points } : null
}

function shapeBox(tag, attrs, vb) {
  const t = tag.toLowerCase()
  const len = (v, full) => (v && v.endsWith('%') ? (parseFloat(v) / 100) * full : num(v))
  if (t === 'rect') {
    const w = len(attr(attrs, 'width'), vb.w)
    const h = len(attr(attrs, 'height'), vb.h)
    const x = len(attr(attrs, 'x'), vb.w) || 0
    const y = len(attr(attrs, 'y'), vb.h) || 0
    return { x, y, w, h, segments: 4, points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] }
  }
  if (t === 'path') return pathBox(attr(attrs, 'd') || '')
  if (t === 'polygon') {
    const p = (attr(attrs, 'points') || '').split(/[\s,]+/).map(Number).filter(Number.isFinite)
    const xs = p.filter((_, k) => k % 2 === 0)
    const ys = p.filter((_, k) => k % 2 === 1)
    return xs.length ? { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), segments: xs.length, points: xs.map((v, k) => [v, ys[k]]) } : null
  }
  const cx = num(attr(attrs, 'cx')) || 0
  const cy = num(attr(attrs, 'cy')) || 0
  const rx = num(attr(attrs, t === 'circle' ? 'r' : 'rx'))
  const ry = num(attr(attrs, t === 'circle' ? 'r' : 'ry'))
  return { x: cx - rx, y: cy - ry, w: 2 * rx, h: 2 * ry, points: [] } // never a block
}

// A block reaches the four corners of the viewBox (a ring or an ellipse does
// not); CORNER = tolerance as a share of each side, allowing rounded icons
const CORNER = 0.08
function isBlock(box, vb) {
  if (!box || !Number.isFinite(box.w) || !Number.isFinite(box.h)) return false
  const spans = box.x <= vb.x + vb.w * (1 - COVER) && box.y <= vb.y + vb.h * (1 - COVER) &&
    box.x + box.w >= vb.x + vb.w * COVER && box.y + box.h >= vb.y + vb.h * COVER
  if (!spans) return false
  const corners = [[vb.x, vb.y], [vb.x + vb.w, vb.y], [vb.x + vb.w, vb.y + vb.h], [vb.x, vb.y + vb.h]]
  return corners.every(([cx, cy]) => box.points.some(([px, py]) =>
    Math.abs(px - cx) <= vb.w * CORNER && Math.abs(py - cy) <= vb.h * CORNER))
}

const NAMED = { white: [255, 255, 255], black: [0, 0, 0] }
function rgbOf(c) {
  if (!c) return null
  const s = c.trim().toLowerCase()
  if (NAMED[s]) return NAMED[s]
  let h = s.startsWith('#') ? s.slice(1) : null
  if (h && h.length === 3) h = h.split('').map((x) => x + x).join('')
  if (h && /^[0-9a-f]{6}$/.test(h)) { const v = parseInt(h, 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255] }
  const m = s.match(/^rgba?\(([^)]+)\)/)
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); if (p.length >= 3) return p.slice(0, 3) }
  return null
}
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

// Colour of a fill: a plain colour or the average of a gradient's stops
function fillColour(fill, xml) {
  const ref = fill.match(/^url\(\s*#([^)\s]+)\s*\)/)
  if (!ref) return rgbOf(fill)
  const grad = xml.match(new RegExp(`<(linearGradient|radialGradient)\\b[^>]*id=["']${ref[1]}["'][\\s\\S]*?</\\1>`, 'i'))
  if (!grad) return null
  const stops = [...grad[0].matchAll(/<stop\b([^>]*)>/gi)].map((m) => rgbOf(attr(m[1], 'stop-color'))).filter(Boolean)
  if (!stops.length) return null
  return [0, 1, 2].map((k) => stops.reduce((s, c) => s + c[k], 0) / stops.length)
}

export function logoLayout(xml) {
  const center = { mode: 'center' }
  if (typeof xml !== 'string') return center
  const vb = viewBoxOf(xml)
  if (!vb || !(vb.w > 0) || !(vb.h > 0)) return center
  const body = xml.replace(/<defs\b[\s\S]*?<\/defs>/gi, '').replace(/<(title|desc|style|clipPath|mask)\b[\s\S]*?<\/\1>/gi, '')
  // The visible background is the LAST of the leading shapes that are
  // blocks (vectorized logos often stack a colour, then white, on top)
  const re = new RegExp(SHAPES.source, 'gi')
  let found = null
  for (let m = re.exec(body); m; m = re.exec(body)) {
    const [, tag, attrs] = m
    // fill: on the shape, else inherited from an enclosing <g> or <svg>, else black
    let fill = attr(attrs, 'fill')
    if (!fill) {
      const inherited = [...body.slice(0, m.index).matchAll(/<(?:g|svg)\b([^>]*)>/gi)].map((g) => attr(g[1], 'fill')).filter(Boolean)
      fill = inherited.length ? inherited[inherited.length - 1] : '#000000'
    }
    if (/^(none|transparent)$/i.test(fill)) break
    const opacity = num(attr(attrs, 'fill-opacity') ?? attr(attrs, 'opacity'))
    if (Number.isFinite(opacity) && opacity < 0.9) break
    const box = shapeBox(tag, attrs, vb)
    if (!isBlock(box, vb)) break
    found = { rgb: fillColour(fill, xml), box }
  }
  if (!found || !found.rgb) return center
  const { rgb, box } = found
  if (rgb[0] + rgb[1] + rgb[2] > 690) return center // white-ish block: keep the white tile
  const ratio = vb.w / vb.h
  if (ratio < SQUARE && 1 / ratio < SQUARE) return { mode: 'fill' }
  // A wide or tall block paints the tile in its colour only when it is a
  // plain box; an outline (a ring, a frame) keeps the white tile.
  return { mode: 'band', bg: box.segments != null && box.segments <= 8 ? hex(rgb) : null }
}
