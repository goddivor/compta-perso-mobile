// Force-directed transaction graph (react-native-svg), inspired by the
// Flutter "graphview" package: FruchtermanReingold layout + an
// InteractiveViewer-like free space (pan / pinch-zoom / double-tap), built
// with a plain PanResponder — no extra native dependency.
//
// Model: one "initial balance" node per account + one node per real
// transaction. Edges: the chronological chain of each account (thin arrows,
// account color) and transfer links between the two sides of a transfer
// (primary yellow, dashed).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, PanResponder, StyleSheet } from 'react-native'
import Svg, { G, Line, Path, Rect, Circle, Text as SvgText } from 'react-native-svg'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius, shadowOverlay } from '../theme/tokens'
import { listAccounts, listTransactions } from '../db/database'
import { fmt, fmtSigned, fmtDate, today, shiftDay } from '../utils/format'
import { useTick } from '../context/AppContext'
import { useFocusData } from '../hooks/useFocusData'
import { useT } from '../i18n'
import { FilterChip } from '../components/FilterChip'
import { EmptyState, Dot } from '../components/ui'
import { computeForceLayout } from './forceLayout'

const MIN_SCALE = 0.3
const MAX_SCALE = 4
const MIN_R = 16
const MAX_R = 34

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const shortDay = (iso) => (iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}` : '')

function periodFrom(period) {
  const t = today()
  if (period === '7d') return shiftDay(t, -6)
  if (period === '30d') return shiftDay(t, -29)
  return undefined
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
  const [accountId, setAccountId] = useState(null)
  const [period, setPeriod] = useState('30d') // default: keeps the layout fluid
  const [selectedId, setSelectedId] = useState(null)

  const { loading } = useFocusData(() => {
    setAccounts(listAccounts())
    setTxs(
      listTransactions({
        account_id: accountId || undefined,
        date_from: periodFrom(period),
      })
    )
  }, [accountId, period, tick])

  /* ------------------------------ Graph model ----------------------------- */

  const model = useMemo(() => {
    const accs = accountId ? accounts.filter((a) => a.id === accountId) : accounts
    const byAccount = new Map(accs.map((a) => [a.id, []]))
    for (const tx of txs) {
      if (byAccount.has(tx.account_id)) byAccount.get(tx.account_id).push(tx)
    }

    const nodes = []
    const edges = []
    const nodeById = new Map()
    let maxW = 1

    const push = (node) => {
      nodes.push(node)
      nodeById.set(node.id, node)
      if (node.weight > maxW) maxW = node.weight
    }

    for (const a of accs) {
      push({
        id: `a${a.id}`,
        kind: 'initial',
        account: a,
        amount: a.initial_balance,
        weight: Math.abs(a.initial_balance),
        group: a.id,
      })
      // Chronological chain: initial balance -> tx1 -> tx2 -> …
      const list = [...byAccount.get(a.id)].sort(
        (x, y) =>
          String(x.date).localeCompare(String(y.date)) ||
          String(x.created_at || '').localeCompare(String(y.created_at || '')) ||
          x.id - y.id
      )
      let prev = `a${a.id}`
      for (const tx of list) {
        const id = `t${tx.id}`
        push({ id, kind: 'tx', tx, account: a, amount: tx.amount, weight: tx.amount, group: a.id })
        edges.push({ from: prev, to: id, kind: 'chain', color: a.color })
        prev = id
      }
    }

    // Transfer links between the two sides of a pair (debit -> credit),
    // added once and only when both nodes are present.
    for (const tx of txs) {
      if (!tx.transfer_pair_id) continue
      if (tx.type !== 'DEBIT') continue
      const from = `t${tx.id}`
      const to = `t${tx.transfer_pair_id}`
      if (nodeById.has(from) && nodeById.has(to)) edges.push({ from, to, kind: 'transfer' })
    }

    // Radius proportional to sqrt(amount), bounded 16..34
    const sqrtMax = Math.sqrt(maxW) || 1
    for (const node of nodes) {
      node.r = clamp(MIN_R + (MAX_R - MIN_R) * (Math.sqrt(node.weight) / sqrtMax), MIN_R, MAX_R)
    }

    return { nodes, edges, nodeById }
  }, [accounts, txs, accountId])

  // 300 iterations, reduced to 150 above 150 nodes to stay responsive
  const layout = useMemo(
    () =>
      computeForceLayout({
        nodes: model.nodes,
        edges: model.edges,
        iterations: model.nodes.length > 150 ? 150 : 300,
      }),
    [model]
  )

  /* --------------------------- Pan / zoom state --------------------------- */

  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 })
  const viewRef = useRef(view)
  viewRef.current = view

  const sizeRef = useRef({ w: 0, h: 0 })
  const [size, setSize] = useState({ w: 0, h: 0 })
  const offsetRef = useRef({ x: 0, y: 0 })
  const containerRef = useRef(null)
  const animRef = useRef(null)

  const setViewNow = useCallback((v) => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    setView(v)
  }, [])

  // Short eased transition toward a target transform (recenter / double-tap)
  const animateTo = useCallback((target, duration = 260) => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    const from = { ...viewRef.current }
    const start = Date.now()
    const step = () => {
      const p = Math.min(1, (Date.now() - start) / duration)
      const e = 1 - Math.pow(1 - p, 3) // ease-out cubic
      setView({
        tx: from.tx + (target.tx - from.tx) * e,
        ty: from.ty + (target.ty - from.ty) * e,
        scale: from.scale + (target.scale - from.scale) * e,
      })
      if (p < 1) animRef.current = requestAnimationFrame(step)
    }
    animRef.current = requestAnimationFrame(step)
  }, [])

  const fitTransform = useCallback(() => {
    const { w, h } = sizeRef.current
    const { width: bw, height: bh } = layout.bounds
    if (!w || !h) return { tx: 0, ty: 0, scale: 1 }
    const pad = 70
    const scale = clamp(Math.min(w / (bw + pad * 2), h / (bh + pad * 2)), MIN_SCALE, 1.4)
    return {
      tx: (w - bw * scale) / 2,
      ty: (h - bh * scale) / 2,
      scale,
    }
  }, [layout])

  const zoomToFit = useCallback(() => animateTo(fitTransform()), [animateTo, fitTransform])

  // Frame the graph whenever the layout (data/filters) changes
  useEffect(() => {
    if (sizeRef.current.w) setViewNow(fitTransform())
  }, [fitTransform, setViewNow])

  const onLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout
    const first = !sizeRef.current.w
    sizeRef.current = { w: width, h: height }
    setSize({ w: width, h: height })
    if (containerRef.current) {
      containerRef.current.measureInWindow((x, y) => {
        offsetRef.current = { x, y }
      })
    }
    if (first) setViewNow(fitTransform())
  }, [fitTransform, setViewNow])

  /* ------------------------------- Gestures ------------------------------- */

  const modelRef = useRef(model)
  modelRef.current = model
  const layoutRef = useRef(layout)
  layoutRef.current = layout

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
      const p = layoutRef.current.positions[node.id]
      if (!p) continue
      const d = Math.hypot(p.x - wx, p.y - wy)
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
        },
        onPanResponderTerminate: () => {
          gRef.current.mode = null
        },
      }),
    [handleTap, zoomAt]
  )

  /* ------------------------------- Rendering ------------------------------ */

  const labelFor = useCallback(
    (node) => {
      if (node.kind === 'initial') {
        return {
          amount: fmt(node.amount),
          amountColor: node.amount < 0 ? colors.danger : colors.success,
          sub: node.account.name,
        }
      }
      return {
        amount: fmtSigned(node.tx.type, node.tx.amount),
        amountColor: node.tx.type === 'CREDIT' ? colors.success : colors.danger,
        sub: shortDay(node.tx.date),
      }
    },
    [colors]
  )

  // Static graph content, memoized so pan/zoom only re-renders the root <G>
  const content = useMemo(() => {
    const { positions } = layout
    const els = []

    for (let i = 0; i < model.edges.length; i++) {
      const e = model.edges[i]
      const a = model.nodeById.get(e.from)
      const b = model.nodeById.get(e.to)
      const p1 = positions[e.from]
      const p2 = positions[e.to]
      if (!p1 || !p2) continue
      const geo = edgeGeometry(p1, p2, a.r, b.r)
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
      const p = positions[node.id]
      if (!p) continue
      const selected = node.id === selectedId
      const label = labelFor(node)
      const pillW = Math.max(label.amount.length, label.sub.length) * 5.6 + 14
      const pillY = p.y + node.r + 5
      els.push(
        <G key={node.id}>
          {node.kind === 'initial' ? (
            // Initial balance: ring in the account color
            <Circle
              cx={p.x}
              cy={p.y}
              r={node.r}
              fill={colors.surface}
              stroke={selected ? colors.ink : node.account.color}
              strokeWidth={selected ? 4 : 3}
            />
          ) : (
            <Circle
              cx={p.x}
              cy={p.y}
              r={node.r}
              fill={node.account.color}
              stroke={selected ? colors.ink : colors.surface}
              strokeWidth={selected ? 3 : 2}
            />
          )}
          {/* Small label pill under the node (surface bg, radius 8) */}
          <Rect
            x={p.x - pillW / 2}
            y={pillY}
            width={pillW}
            height={26}
            rx={8}
            fill={colors.surface}
            stroke={colors.line}
            strokeWidth={1}
          />
          <SvgText
            x={p.x}
            y={pillY + 11}
            fontSize={9}
            fontFamily={fonts.semibold}
            fill={label.amountColor}
            textAnchor="middle"
          >
            {label.amount}
          </SvgText>
          <SvgText
            x={p.x}
            y={pillY + 21.5}
            fontSize={8}
            fontFamily={fonts.regular}
            fill={colors.muted}
            textAnchor="middle"
          >
            {label.sub}
          </SvgText>
        </G>
      )
    }
    return els
  }, [layout, model, colors, selectedId, labelFor])

  const selectedNode = selectedId ? model.nodeById.get(selectedId) : null

  const accountOptions = useMemo(
    () => [
      { label: t('report.allAccounts'), value: '' },
      ...accounts.map((a) => ({ label: a.name, value: a.id, color: a.color })),
    ],
    [accounts, t]
  )
  const periodOptions = [
    { label: t('period.7d'), value: '7d' },
    { label: t('period.30d'), value: '30d' },
    { label: t('period.all'), value: '' },
  ]
  const currentAccount = accounts.find((a) => a.id === accountId)

  return (
    <View style={{ flex: 1 }}>
      {/* Filters: account + quick period (default 30 days) */}
      <View style={styles.filters}>
        <FilterChip
          label={currentAccount ? currentAccount.name : t('report.allAccounts')}
          active={!!accountId}
          options={accountOptions}
          value={accountId || ''}
          onChange={(v) => setAccountId(v || null)}
        />
        <FilterChip
          label={periodOptions.find((p) => p.value === period)?.label || t('period.all')}
          active={period !== ''}
          options={periodOptions}
          value={period}
          onChange={setPeriod}
        />
      </View>

      {!loading && model.nodes.length === 0 ? (
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

          {/* Floating recenter button (zoom-to-fit) */}
          <Pressable
            onPress={zoomToFit}
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
                  : t('graph.initialBalance')}
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
                        : selectedNode.amount < 0
                          ? colors.danger
                          : colors.success,
                  }}
                >
                  {selectedNode.kind === 'tx'
                    ? fmtSigned(selectedNode.tx.type, selectedNode.tx.amount)
                    : fmt(selectedNode.amount)}
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
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 10,
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
