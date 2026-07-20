// Transaction graph, "chronological columns" layout (react-native-svg).
// One vertical column per selected account (ordered by account position,
// ~220 units apart), headed by an account node. ALL transactions of the
// selected accounts are merged chronologically; each one gets a global row
// (row height ~90), so time flows downward and every account reads like a
// queue. Transfer pairs whose two sides are visible share the SAME row and
// are linked debit -> credit by a primary-yellow arrow across the columns.
// The signed amount is drawn INSIDE each node (compact notation when long).
//
// The canvas is a free space: pan / pinch-zoom / double-tap with a plain
// PanResponder (no extra native dependency), recenter button, detail card.
// Perf: row assignment cached per account selection, and the SVG only
// renders the rows inside the visible window (± margin), recomputed on
// gesture release and on a ~150 ms throttle while panning.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, ScrollView, PanResponder, StyleSheet } from 'react-native'
import Svg, { G, Line, Path, Circle, Text as SvgText } from 'react-native-svg'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius, shadowOverlay } from '../theme/tokens'
import { listAccounts, listTransactionsForGraph } from '../db/database'
import { fmt, fmtSigned, fmtDate } from '../utils/format'
import { useTick } from '../context/AppContext'
import { useFocusData } from '../hooks/useFocusData'
import { useT } from '../i18n'
import { EmptyState, Dot } from '../components/ui'

const MIN_SCALE = 0.3
const MAX_SCALE = 4
const MIN_R = 20
const MAX_R = 34
const HEADER_R = 24

// Layout constants (graph units)
const COL0_X = 96 // x of the first column
const COL_SPACING = 220
const HEADER_Y = 34
const ROW0_Y = HEADER_Y + 112 // y of the first transaction row
const ROW_H = 90

// Windowed rendering
const ROW_MARGIN = 12 // extra rows rendered above/below the viewport
const RANGE_THROTTLE_MS = 150

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Compact French amount for in-node display: 850, 12,5k, 1,2M
function compactAmount(type, n) {
  const sign = type === 'CREDIT' ? '+' : '-'
  const abs = Math.abs(Math.round(n || 0))
  const one = (v) => v.toFixed(1).replace('.0', '').replace('.', ',')
  if (abs >= 1e6) return `${sign}${one(abs / 1e6)}M`
  if (abs >= 1e4) return `${sign}${one(abs / 1e3)}k`
  return `${sign}${abs}`
}

// Ink on light node colors, white on dark ones (luminance cut)
function contrastText(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex) || '')
  if (!m) return '#FFFFFF'
  const v = parseInt(m[1], 16)
  const lum = 0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)
  return lum > 160 ? '#1A1714' : '#FFFFFF'
}

// Straight edge trimmed to the node borders + a small arrow head at the target
function edgeGeometry(p1, p2, r1, r2) {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d
  const uy = dy / d
  const tip = { x: p2.x - ux * (r2 + 1), y: p2.y - uy * (r2 + 1) }
  const ah = 8
  const aw = 4.5
  const bx = tip.x - ux * ah
  const by = tip.y - uy * ah
  return {
    x1: p1.x + ux * r1,
    y1: p1.y + uy * r1,
    x2: tip.x - ux * (ah - 2),
    y2: tip.y - uy * (ah - 2),
    head: `M${tip.x},${tip.y} L${bx - uy * aw},${by + ux * aw} L${bx + uy * aw},${by - ux * aw} Z`,
  }
}

export default function PhysicsGraphView() {
  const { colors } = useTheme()
  const t = useT()
  const tick = useTick()

  const [accounts, setAccounts] = useState([])
  const [txs, setTxs] = useState([])
  const [selectedIds, setSelectedIds] = useState(null) // null = all accounts
  const [selectedId, setSelectedId] = useState(null) // selected node (detail card)

  const { loading } = useFocusData(() => {
    setAccounts(listAccounts()) // already ordered by account position
    setTxs(listTransactionsForGraph()) // every transaction, oldest first
  }, [tick])

  // Toggle chips: tap an account to show/hide its column, "All" resets
  const toggleAccount = useCallback((id) => {
    setSelectedIds((cur) => {
      if (cur === null) return [id] // from "all" to this single account
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
      return next.length === 0 ? null : next
    })
    setSelectedId(null)
  }, [])

  /* --------------------- Chronological columns layout --------------------- */

  // Row/node assignment cache: key = sorted selected account ids, cleared
  // whenever the underlying data reloads (array identity change).
  const cacheRef = useRef({ accounts: null, txs: null, map: new Map() })

  const model = useMemo(() => {
    const cache = cacheRef.current
    if (cache.accounts !== accounts || cache.txs !== txs) {
      cache.accounts = accounts
      cache.txs = txs
      cache.map.clear()
    }
    const key = selectedIds === null ? 'all' : [...selectedIds].sort((a, b) => a - b).join(',')
    const hit = cache.map.get(key)
    if (hit) return hit

    const shown = selectedIds === null ? accounts : accounts.filter((a) => selectedIds.includes(a.id))
    const shownIds = new Set(shown.map((a) => a.id))
    const colX = new Map(shown.map((a, i) => [a.id, COL0_X + i * COL_SPACING]))
    const accById = new Map(shown.map((a) => [a.id, a]))

    // txs already come sorted chronologically (date, created_at, id)
    const visibleTxs = txs.filter((tx) => shownIds.has(tx.account_id))
    const txById = new Map(visibleTxs.map((tx) => [tx.id, tx]))

    // One global row per transaction; a visible transfer pair shares its row
    const rowById = new Map()
    let rowCount = 0
    for (const tx of visibleTxs) {
      if (rowById.has(tx.id)) continue
      rowById.set(tx.id, rowCount)
      if (tx.transfer_pair_id) {
        const partner = txById.get(tx.transfer_pair_id)
        if (partner && !rowById.has(partner.id)) rowById.set(partner.id, rowCount)
      }
      rowCount++
    }

    // Node sizes: radius proportional to sqrt(amount), bounded 20..34
    let maxW = 1
    for (const tx of visibleTxs) if (tx.amount > maxW) maxW = tx.amount
    const sqrtMax = Math.sqrt(maxW) || 1

    const nodes = []
    const nodeById = new Map()
    const push = (node) => {
      nodes.push(node)
      nodeById.set(node.id, node)
    }

    for (const a of shown) {
      push({
        id: `h${a.id}`,
        kind: 'header',
        account: a,
        row: -1,
        x: colX.get(a.id),
        y: HEADER_Y,
        r: HEADER_R,
      })
    }
    for (const tx of visibleTxs) {
      const row = rowById.get(tx.id)
      push({
        id: `t${tx.id}`,
        kind: 'tx',
        tx,
        account: accById.get(tx.account_id),
        row,
        x: colX.get(tx.account_id),
        y: ROW0_Y + row * ROW_H,
        r: clamp(MIN_R + (MAX_R - MIN_R) * (Math.sqrt(tx.amount) / sqrtMax), MIN_R, MAX_R),
        // Transfer whose partner account is hidden: chevron indicator
        hiddenTransfer: !!tx.transfer_pair_id && !txById.has(tx.transfer_pair_id),
      })
    }

    // Account chain: header -> tx -> tx … down each column. Edges keep their
    // endpoint rows so the windowed renderer can cull them cheaply.
    const edges = []
    for (const a of shown) {
      const column = visibleTxs
        .filter((tx) => tx.account_id === a.id)
        .sort((x, y) => rowById.get(x.id) - rowById.get(y.id))
      let prev = `h${a.id}`
      let prevRow = -1
      for (const tx of column) {
        const row = rowById.get(tx.id)
        edges.push({ from: prev, to: `t${tx.id}`, kind: 'chain', color: a.color, rowMin: prevRow, rowMax: row })
        prev = `t${tx.id}`
        prevRow = row
      }
    }
    // Transfer links (debit -> credit) across the columns, on a shared row
    for (const tx of visibleTxs) {
      if (!tx.transfer_pair_id || tx.type !== 'DEBIT') continue
      if (txById.has(tx.transfer_pair_id)) {
        const row = rowById.get(tx.id)
        edges.push({ from: `t${tx.id}`, to: `t${tx.transfer_pair_id}`, kind: 'transfer', rowMin: row, rowMax: row })
      }
    }

    const cols = shown.length
    const result = {
      nodes,
      edges,
      nodeById,
      cols,
      rows: rowCount,
      bounds: {
        width: cols > 0 ? COL0_X + (cols - 1) * COL_SPACING + 96 : 0,
        height: rowCount > 0 ? ROW0_Y + rowCount * ROW_H : ROW0_Y + 60,
      },
    }
    cache.map.set(key, result)
    return result
  }, [accounts, txs, selectedIds])

  /* --------------------------- Pan / zoom state --------------------------- */

  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 })
  const viewRef = useRef(view)
  viewRef.current = view

  const sizeRef = useRef({ w: 0, h: 0 })
  const [size, setSize] = useState({ w: 0, h: 0 })
  const offsetRef = useRef({ x: 0, y: 0 })
  const containerRef = useRef(null)
  const animRef = useRef(null)

  /* ----------------------- Windowed rendering range ----------------------- */

  const [range, setRange] = useState({ min: -1, max: 40 })
  const rangeStampRef = useRef(0)

  // Visible row window from the current transform (± ROW_MARGIN rows)
  const updateRange = useCallback(() => {
    const v = viewRef.current
    const { h } = sizeRef.current
    if (!h || !v.scale) return
    const yTop = (0 - v.ty) / v.scale
    const yBottom = (h - v.ty) / v.scale
    const min = Math.floor((yTop - ROW0_Y) / ROW_H) - ROW_MARGIN
    const max = Math.ceil((yBottom - ROW0_Y) / ROW_H) + ROW_MARGIN
    setRange((r) => (r.min === min && r.max === max ? r : { min, max }))
  }, [])

  // Throttled variant used while a gesture/animation is running
  const scheduleRange = useCallback(() => {
    const now = Date.now()
    if (now - rangeStampRef.current >= RANGE_THROTTLE_MS) {
      rangeStampRef.current = now
      updateRange()
    }
  }, [updateRange])

  const setViewNow = useCallback(
    (v) => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      setView(v)
      viewRef.current = v
      updateRange()
    },
    [updateRange]
  )

  // Short eased transition toward a target transform (recenter / double-tap)
  const animateTo = useCallback(
    (target, duration = 260) => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      const from = { ...viewRef.current }
      const start = Date.now()
      const step = () => {
        const p = Math.min(1, (Date.now() - start) / duration)
        const e = 1 - Math.pow(1 - p, 3) // ease-out cubic
        const next = {
          tx: from.tx + (target.tx - from.tx) * e,
          ty: from.ty + (target.ty - from.ty) * e,
          scale: from.scale + (target.scale - from.scale) * e,
        }
        setView(next)
        viewRef.current = next
        if (p < 1) {
          scheduleRange()
          animRef.current = requestAnimationFrame(step)
        } else {
          updateRange()
        }
      }
      animRef.current = requestAnimationFrame(step)
    },
    [scheduleRange, updateRange]
  )

  // Home view: anchored at the TOP of the timeline (first transactions),
  // width-fitted but never below a readable floor — the user scrolls down
  // for the rest. Used for the initial framing and the recenter button.
  const homeTransform = useCallback(() => {
    const { w } = sizeRef.current
    const { width: bw } = model.bounds
    if (!w || !bw) return { tx: 0, ty: 0, scale: 1 }
    const pad = 32
    const scale = clamp(w / (bw + pad * 2), 0.7, 1.25)
    return {
      tx: bw * scale <= w ? (w - bw * scale) / 2 : 8, // left-anchor on overflow
      ty: 16,
      scale,
    }
  }, [model])

  const recenter = useCallback(() => animateTo(homeTransform()), [animateTo, homeTransform])

  // Back to the top view whenever the layout (data/selection) changes
  useEffect(() => {
    if (sizeRef.current.w) setViewNow(homeTransform())
  }, [homeTransform, setViewNow])

  const onLayout = useCallback(
    (e) => {
      const { width, height } = e.nativeEvent.layout
      const first = !sizeRef.current.w
      sizeRef.current = { w: width, h: height }
      setSize({ w: width, h: height })
      if (containerRef.current) {
        containerRef.current.measureInWindow((x, y) => {
          offsetRef.current = { x, y }
        })
      }
      if (first) setViewNow(homeTransform())
      else updateRange()
    },
    [homeTransform, setViewNow, updateRange]
  )

  /* ------------------------------- Gestures ------------------------------- */

  const modelRef = useRef(model)
  modelRef.current = model

  const zoomAt = useCallback(
    (local, factor) => {
      const v = viewRef.current
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE)
      const wx = (local.x - v.tx) / v.scale
      const wy = (local.y - v.ty) / v.scale
      animateTo({ tx: local.x - wx * scale, ty: local.y - wy * scale, scale })
    },
    [animateTo]
  )

  const handleTap = useCallback((local) => {
    const v = viewRef.current
    const wx = (local.x - v.tx) / v.scale
    const wy = (local.y - v.ty) / v.scale
    let best = null
    let bestD = Infinity
    for (const node of modelRef.current.nodes) {
      const d = Math.hypot(node.x - wx, node.y - wy)
      if (d <= node.r + 8 && d < bestD) {
        best = node.id
        bestD = d
      }
    }
    setSelectedId(best) // tap on empty space closes the card
  }, [])

  const gRef = useRef({
    mode: null,
    startView: null,
    p0: null,
    dist0: 1,
    mid0: null,
    moved: false,
    startAt: 0,
    lastTapAt: 0,
    lastTapPos: null,
  })

  const startPinch = (touches) => {
    const s = gRef.current
    const [a, b] = touches
    s.mode = 'pinch'
    s.startView = { ...viewRef.current }
    s.dist0 = Math.max(12, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY))
    s.mid0 = {
      x: (a.pageX + b.pageX) / 2 - offsetRef.current.x,
      y: (a.pageY + b.pageY) / 2 - offsetRef.current.y,
    }
    s.moved = true
  }

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const s = gRef.current
          const touches = evt.nativeEvent.touches
          if (animRef.current) cancelAnimationFrame(animRef.current)
          s.moved = false
          s.startAt = Date.now()
          if (touches.length >= 2) startPinch(touches)
          else {
            s.mode = 'pan'
            s.startView = { ...viewRef.current }
            s.p0 = { x: touches[0].pageX, y: touches[0].pageY }
          }
        },
        onPanResponderMove: (evt) => {
          const s = gRef.current
          const touches = evt.nativeEvent.touches
          if (touches.length >= 2) {
            // 2 fingers: zoom around the midpoint (rebase when entering pinch)
            if (s.mode !== 'pinch') return startPinch(touches)
            const [a, b] = touches
            const dist = Math.max(12, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY))
            const scale = clamp(s.startView.scale * (dist / s.dist0), MIN_SCALE, MAX_SCALE)
            const mid = {
              x: (a.pageX + b.pageX) / 2 - offsetRef.current.x,
              y: (a.pageY + b.pageY) / 2 - offsetRef.current.y,
            }
            // Keep the world point that was under the initial midpoint pinned
            const wx = (s.mid0.x - s.startView.tx) / s.startView.scale
            const wy = (s.mid0.y - s.startView.ty) / s.startView.scale
            setView({ tx: mid.x - wx * scale, ty: mid.y - wy * scale, scale })
            scheduleRange()
          } else if (touches.length === 1) {
            // 1 finger: pan (rebase when coming back from a pinch)
            if (s.mode !== 'pan') {
              s.mode = 'pan'
              s.startView = { ...viewRef.current }
              s.p0 = { x: touches[0].pageX, y: touches[0].pageY }
              return
            }
            const dx = touches[0].pageX - s.p0.x
            const dy = touches[0].pageY - s.p0.y
            if (Math.abs(dx) + Math.abs(dy) > 6) s.moved = true
            setView({ tx: s.startView.tx + dx, ty: s.startView.ty + dy, scale: s.startView.scale })
            scheduleRange()
          }
        },
        onPanResponderRelease: (evt) => {
          const s = gRef.current
          const now = Date.now()
          if (!s.moved && s.mode === 'pan' && now - s.startAt < 280) {
            const local = {
              x: evt.nativeEvent.pageX - offsetRef.current.x,
              y: evt.nativeEvent.pageY - offsetRef.current.y,
            }
            const isDouble =
              now - s.lastTapAt < 300 &&
              s.lastTapPos &&
              Math.hypot(local.x - s.lastTapPos.x, local.y - s.lastTapPos.y) < 40
            if (isDouble) {
              s.lastTapAt = 0
              setSelectedId(null)
              zoomAt(local, 2) // double-tap: zoom x2 on the tapped point
            } else {
              s.lastTapAt = now
              s.lastTapPos = local
              handleTap(local)
            }
          }
          s.mode = null
          updateRange() // settle the visible window after the gesture
        },
        onPanResponderTerminate: () => {
          gRef.current.mode = null
          updateRange()
        },
      }),
    [handleTap, zoomAt, scheduleRange, updateRange]
  )

  /* ------------------------------- Rendering ------------------------------ */

  // Windowed SVG content: only the rows inside `range` are materialized.
  // Every dependency is stable between range updates (model and colors are
  // memoized, selectedId only changes on tap), so panning between two range
  // recomputations re-renders nothing but the root <G> transform.
  const content = useMemo(() => {
    const els = []
    const { min, max } = range

    for (let i = 0; i < model.edges.length; i++) {
      const e = model.edges[i]
      if (e.rowMax < min || e.rowMin > max) continue // outside the window
      const a = model.nodeById.get(e.from)
      const b = model.nodeById.get(e.to)
      if (!a || !b) continue
      const geo = edgeGeometry({ x: a.x, y: a.y }, { x: b.x, y: b.y }, a.r, b.r)
      const isTransfer = e.kind === 'transfer'
      const stroke = isTransfer ? colors.primary : e.color
      els.push(
        <G key={`e${i}`}>
          <Line
            x1={geo.x1}
            y1={geo.y1}
            x2={geo.x2}
            y2={geo.y2}
            stroke={stroke}
            strokeWidth={isTransfer ? 2.2 : 1.4}
            strokeOpacity={isTransfer ? 1 : 0.8}
            strokeDasharray={isTransfer ? '7 6' : undefined}
          />
          <Path d={geo.head} fill={stroke} fillOpacity={isTransfer ? 1 : 0.9} />
        </G>
      )
    }

    for (const node of model.nodes) {
      if (node.row < min || node.row > max) continue // outside the window
      const selected = node.id === selectedId

      if (node.kind === 'header') {
        // Account header: colored circle with the initial + name below
        const name = node.account.name || '?'
        els.push(
          <G key={node.id}>
            <Circle
              cx={node.x}
              cy={node.y}
              r={node.r}
              fill={node.account.color}
              stroke={selected ? colors.ink : colors.surface}
              strokeWidth={selected ? 3.5 : 2.5}
            />
            <SvgText
              x={node.x}
              y={node.y + 5.5}
              fontSize={16}
              fontFamily={fonts.semibold}
              fill={contrastText(node.account.color)}
              textAnchor="middle"
            >
              {name.trim().charAt(0).toUpperCase()}
            </SvgText>
            <SvgText
              x={node.x}
              y={node.y + node.r + 15}
              fontSize={10}
              fontFamily={fonts.semibold}
              fill={colors.ink}
              textAnchor="middle"
            >
              {name}
            </SvgText>
          </G>
        )
        continue
      }

      // Signed compact amount INSIDE the node, sized to fit the radius
      const label = compactAmount(node.tx.type, node.tx.amount)
      const fontSize = clamp((node.r * 1.7) / (label.length * 0.62), 8, 13)
      els.push(
        <G key={node.id}>
          <Circle
            cx={node.x}
            cy={node.y}
            r={node.r}
            fill={node.account.color}
            stroke={selected ? colors.ink : colors.surface}
            strokeWidth={selected ? 3 : 2}
          />
          <SvgText
            x={node.x}
            y={node.y + fontSize * 0.36}
            fontSize={fontSize}
            fontFamily={fonts.bold}
            fill={contrastText(node.account.color)}
            textAnchor="middle"
          >
            {label}
          </SvgText>
          {node.hiddenTransfer ? (
            // Transfer whose partner account is not displayed
            <Path
              d={`M${node.x + node.r + 5},${node.y - 6} l 7,6 l -7,6`}
              stroke={colors.primary}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ) : null}
        </G>
      )
    }
    return els
  }, [model, colors, selectedId, range])

  const selectedNode = selectedId ? model.nodeById.get(selectedId) : null

  return (
    <View style={{ flex: 1 }}>
      {/* Multi-select account chips ("All" + one per account) */}
      <View style={styles.filters}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <Pressable
            onPress={() => {
              setSelectedIds(null)
              setSelectedId(null)
            }}
            style={[
              styles.chip,
              {
                backgroundColor: selectedIds === null ? colors.primary : colors.surface,
                borderColor: selectedIds === null ? colors.primary : colors.line,
              },
            ]}
          >
            <Text
              style={{
                fontFamily: selectedIds === null ? fonts.semibold : fonts.medium,
                fontSize: 12,
                color: selectedIds === null ? colors.primaryInk : colors.content,
              }}
            >
              {t('graph.allChip')}
            </Text>
          </Pressable>
          {accounts.map((a) => {
            const active = selectedIds !== null && selectedIds.includes(a.id)
            return (
              <Pressable
                key={a.id}
                onPress={() => toggleAccount(a.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.line,
                  },
                ]}
              >
                <Dot color={a.color} size={8} />
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: active ? fonts.semibold : fonts.medium,
                    fontSize: 12,
                    color: active ? colors.primaryInk : colors.content,
                    maxWidth: 110,
                  }}
                >
                  {a.name}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {!loading && model.cols === 0 ? (
        <EmptyState icon="git-network-outline" text={t('graph.empty')} />
      ) : (
        <View style={{ flex: 1 }}>
          {/* Free zoomable/pannable space */}
          <View
            ref={containerRef}
            onLayout={onLayout}
            collapsable={false}
            style={{ flex: 1, overflow: 'hidden' }}
            {...pan.panHandlers}
          >
            {size.w > 0 ? (
              <Svg width={size.w} height={size.h}>
                <G transform={`translate(${view.tx}, ${view.ty}) scale(${view.scale})`}>{content}</G>
              </Svg>
            ) : null}
          </View>

          {/* Floating recenter button (back to the top of the timeline) */}
          <Pressable
            onPress={recenter}
            accessibilityLabel={t('graph.recenter')}
            style={({ pressed }) => [
              styles.recenter,
              shadowOverlay,
              { backgroundColor: pressed ? colors.primary600 : colors.primary },
            ]}
          >
            <Ionicons name="locate" size={22} color={colors.primaryInk} />
          </Pressable>

          {/* Bottom detail card for the selected node */}
          {selectedNode ? (
            <View
              style={[
                styles.detail,
                shadowOverlay,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Dot color={selectedNode.account.color} size={9} />
                <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.muted, flex: 1 }} numberOfLines={1}>
                  {selectedNode.account.name}
                </Text>
                <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted }}>
                  {selectedNode.kind === 'tx' ? fmtDate(selectedNode.tx.date) : t('graph.initialBalance')}
                </Text>
              </View>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }} numberOfLines={2}>
                {selectedNode.kind === 'tx'
                  ? selectedNode.tx.description || selectedNode.tx.category_name || t('graph.noDescription')
                  : selectedNode.account.name}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text
                  style={{
                    fontFamily: fonts.bold,
                    fontSize: 16,
                    color:
                      selectedNode.kind === 'tx'
                        ? selectedNode.tx.type === 'CREDIT'
                          ? colors.success
                          : colors.danger
                        : selectedNode.account.initial_balance < 0
                          ? colors.danger
                          : colors.success,
                  }}
                >
                  {selectedNode.kind === 'tx'
                    ? fmtSigned(selectedNode.tx.type, selectedNode.tx.amount)
                    : fmt(selectedNode.account.initial_balance)}
                </Text>
                {selectedNode.kind === 'tx' && selectedNode.tx.fees > 0 ? (
                  <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted }}>
                    {t('tx.inclFees', { amount: fmt(selectedNode.tx.fees) })}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  filters: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    minHeight: 34,
  },
  recenter: {
    position: 'absolute',
    right: 16,
    top: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detail: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    gap: 6,
  },
})
