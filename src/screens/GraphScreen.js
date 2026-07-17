// Graph view: DAG of transactions per account, ported from the desktop
// canvas GraphView (vertical and horizontal layouts, ellipse nodes per
// transaction, straight arrows between consecutive nodes and dashed bezier
// links between the two sides of a transfer). Rendered with react-native-svg
// inside nested scroll views; dimensions adapt to content like on desktop.
// Forecast branches are not ported (forecast is excluded on mobile v1).
import { memo, useMemo, useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Ellipse, Line, Polygon, Path, Text as SvgText, G } from 'react-native-svg'
import { useTheme, fonts } from '../theme/tokens'
import { listAccounts, listTransactions } from '../db/database'
import { fmt, fmtDate } from '../utils/format'
import { useTick } from '../context/AppContext'
import { useFocusData } from '../hooks/useFocusData'
import { Segmented, EmptyState } from '../components/ui'
import { FilterChip } from '../components/FilterChip'

// Same layout constants as the desktop GraphView
const NODE_W = 172
const NODE_H = 74
const ARROW_H = 10
const V = { PAD_X: 30, PAD_Y: 54, COL_W: 220, ROW_H: 118 }
const H = { PAD_X: 20, PAD_Y: 30, LABEL_W: 82, NODE_STEP: 210, ROW_H: 114 }

// Approximate canvas measureText: clip a label to the node inner width
function clip(text, fontSize, maxW) {
  const charW = fontSize * 0.58
  const maxChars = Math.max(1, Math.floor(maxW / charW))
  if (!text || text.length <= maxChars) return text
  return text.slice(0, maxChars - 1) + '…'
}

function arrowHead(x1, y1, x2, y2, size = ARROW_H) {
  const a = Math.atan2(y2 - y1, x2 - x1)
  const p1 = `${x2 - size * Math.cos(a - Math.PI / 6)},${y2 - size * Math.sin(a - Math.PI / 6)}`
  const p2 = `${x2 - size * Math.cos(a + Math.PI / 6)},${y2 - size * Math.sin(a + Math.PI / 6)}`
  return `${x2},${y2} ${p1} ${p2}`
}

// Build the running-balance series per account (desktop realSeries)
function buildSeries(accounts, transactions) {
  return accounts.map((account) => {
    const txs = transactions
      .filter((t) => t.account_id === account.id && !t.forecast_session_id)
      .sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id)
    let bal = account.initial_balance
    const points = [{ date: account.created_at || new Date().toISOString(), balance: bal, label: 'Solde initial', tx: null }]
    for (const tx of txs) {
      bal += tx.type === 'CREDIT' ? tx.amount : -tx.amount
      points.push({
        date: tx.date,
        balance: bal,
        label: tx.description || tx.category_name || (tx.type === 'CREDIT' ? 'Crédit' : 'Débit'),
        tx,
      })
    }
    return { account, points }
  })
}

// Compute node positions + arrows + labels for both layouts
function buildScene(series, layout) {
  const nodes = []
  const arrows = []
  const labels = []

  let width, height
  if (layout === 'horizontal') {
    const maxCols = Math.max(1, ...series.map((s) => s.points.length))
    width = Math.max(H.PAD_X * 2 + H.LABEL_W + maxCols * H.NODE_STEP, 500)
    height = Math.max(H.PAD_Y * 2 + series.length * H.ROW_H, 300)
    const nodeX = (colIdx) => H.PAD_X + H.LABEL_W + colIdx * H.NODE_STEP + NODE_W / 2

    series.forEach(({ account, points }, rowIdx) => {
      const cy = H.PAD_Y + rowIdx * H.ROW_H + NODE_H / 2
      const color = account.color || '#3B82F6'
      labels.push({ x: H.PAD_X + H.LABEL_W - 10, y: cy + 4, text: account.name, color, anchor: 'end' })
      points.forEach((p, colIdx) => {
        const cx = nodeX(colIdx)
        if (colIdx > 0) arrows.push({ x1: nodeX(colIdx - 1) + NODE_W / 2, y1: cy, x2: cx - NODE_W / 2, y2: cy })
        nodes.push({ cx, cy, point: p, account, color })
      })
    })
  } else {
    width = Math.max(V.PAD_X * 2 + series.length * V.COL_W, 400)
    const maxRows = Math.max(1, ...series.map((s) => s.points.length))
    height = Math.max(V.PAD_Y * 2 + maxRows * V.ROW_H, 300)

    series.forEach(({ account, points }, colIdx) => {
      const cx = V.PAD_X + colIdx * V.COL_W + V.COL_W / 2
      const color = account.color || '#3B82F6'
      labels.push({ x: cx, y: V.PAD_Y - 14, text: account.name, color, anchor: 'middle' })
      points.forEach((p, rowIdx) => {
        const cy = V.PAD_Y + rowIdx * V.ROW_H + NODE_H / 2
        if (rowIdx > 0) {
          const prevCy = V.PAD_Y + (rowIdx - 1) * V.ROW_H + NODE_H / 2
          arrows.push({ x1: cx, y1: prevCy + NODE_H / 2, x2: cx, y2: cy - NODE_H / 2 })
        }
        nodes.push({ cx, cy, point: p, account, color })
      })
    })
  }

  // Dashed bezier links between the two sides of each transfer pair
  const links = []
  const txNodeMap = {}
  for (const n of nodes) if (n.point.tx?.id) txNodeMap[n.point.tx.id] = n
  const done = new Set()
  for (const n of nodes) {
    const pairId = n.point.tx?.transfer_pair_id
    if (!pairId) continue
    const key = [n.point.tx.id, pairId].sort((a, b) => a - b).join('-')
    if (done.has(key)) continue
    done.add(key)
    const partner = txNodeMap[pairId]
    if (!partner) continue
    const left = n.cx <= partner.cx ? n : partner
    const right = n.cx <= partner.cx ? partner : n
    const x1 = left.cx + NODE_W / 2
    const y1 = left.cy
    const x2 = right.cx - NODE_W / 2
    const y2 = right.cy
    const mx = (x1 + x2) / 2
    links.push({ d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`, x1, y1, x2, y2 })
  }

  return { width, height, nodes, arrows, labels, links }
}

const GraphNode = memo(function GraphNode({ node, colors }) {
  const { cx, cy, point, color } = node
  const innerW = NODE_W - 24
  const tx = point.tx

  return (
    <G>
      <Ellipse
        cx={cx}
        cy={cy}
        rx={NODE_W / 2}
        ry={NODE_H / 2}
        fill={colors.surface}
        stroke={color}
        strokeWidth={2}
      />
      {tx ? (
        <>
          <SvgText x={cx} y={cy - 22} fontSize={10} fill={colors.faint} textAnchor="middle" fontFamily={fonts.regular}>
            {fmtDate(point.date)}
          </SvgText>
          <SvgText x={cx} y={cy - 6} fontSize={11} fill={colors.content} textAnchor="middle" fontFamily={fonts.medium}>
            {clip(point.label, 11, innerW)}
          </SvgText>
          <SvgText
            x={cx}
            y={cy + 10}
            fontSize={12}
            fill={tx.type === 'CREDIT' ? colors.success : colors.danger}
            textAnchor="middle"
            fontFamily={fonts.bold}
          >
            {(tx.type === 'CREDIT' ? '+' : '-') + fmt(tx.amount)}
          </SvgText>
          <SvgText x={cx} y={cy + 26} fontSize={10} fill={colors.muted} textAnchor="middle" fontFamily={fonts.regular}>
            {'= ' + fmt(point.balance)}
          </SvgText>
        </>
      ) : (
        <>
          <SvgText x={cx} y={cy - 16} fontSize={10} fill={colors.faint} textAnchor="middle" fontFamily={fonts.regular}>
            {fmtDate(point.date)}
          </SvgText>
          <SvgText x={cx} y={cy} fontSize={11} fill={colors.content} textAnchor="middle" fontFamily={fonts.medium}>
            {point.label}
          </SvgText>
          <SvgText x={cx} y={cy + 18} fontSize={12} fill={color} textAnchor="middle" fontFamily={fonts.bold}>
            {fmt(point.balance)}
          </SvgText>
        </>
      )}
    </G>
  )
})

export default function GraphScreen() {
  const { colors } = useTheme()
  const tick = useTick()
  const [layout, setLayout] = useState('vertical')
  const [accountId, setAccountId] = useState('')
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])

  const { loading } = useFocusData(() => {
    setAccounts(listAccounts())
    setTransactions(listTransactions())
  }, [tick])

  const shownAccounts = useMemo(
    () => (accountId ? accounts.filter((a) => String(a.id) === String(accountId)) : accounts),
    [accounts, accountId]
  )

  const scene = useMemo(() => {
    if (!shownAccounts.length) return null
    const series = buildSeries(shownAccounts, transactions)
    return buildScene(series, layout)
  }, [shownAccounts, transactions, layout])

  const accountLabel = accounts.find((a) => String(a.id) === String(accountId))?.name

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.header}>
        <Text style={{ fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink }}>Graphe</Text>
      </View>

      <View style={{ paddingHorizontal: 20, gap: 10, paddingBottom: 12 }}>
        <Segmented
          value={layout}
          onChange={setLayout}
          segments={[
            { label: 'Vertical', value: 'vertical' },
            { label: 'Horizontal', value: 'horizontal' },
          ]}
        />
        <View style={{ flexDirection: 'row' }}>
          <FilterChip
            label={accountLabel || 'Compte'}
            active={!!accountId}
            value={accountId}
            onChange={setAccountId}
            options={[
              { label: 'Tous les comptes', value: '' },
              ...accounts.map((a) => ({ label: a.name, value: a.id, color: a.color })),
            ]}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary600} />
        </View>
      ) : !scene ? (
        <EmptyState icon="git-branch-outline" text="Aucune donnée à afficher." />
      ) : (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
            <Svg width={scene.width} height={scene.height}>
              {/* Arrows between consecutive nodes */}
              {scene.arrows.map((a, i) => (
                <G key={`a${i}`}>
                  <Line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={colors.faint} strokeWidth={1.5} />
                  <Polygon points={arrowHead(a.x1, a.y1, a.x2, a.y2)} fill={colors.faint} />
                </G>
              ))}

              {/* Dashed transfer links between accounts */}
              {scene.links.map((l, i) => (
                <G key={`l${i}`}>
                  <Path d={l.d} stroke={colors.link} strokeWidth={1.5} strokeDasharray="5,4" fill="none" />
                  <Polygon points={arrowHead(l.x1, l.y1, l.x2, l.y2, 9)} fill={colors.link} />
                </G>
              ))}

              {/* Account labels */}
              {scene.labels.map((t, i) => (
                <SvgText
                  key={`t${i}`}
                  x={t.x}
                  y={t.y}
                  fontSize={12}
                  fill={t.color}
                  textAnchor={t.anchor}
                  fontFamily={fonts.bold}
                >
                  {t.text}
                </SvgText>
              ))}

              {/* Transaction nodes */}
              {scene.nodes.map((n, i) => (
                <GraphNode key={`n${i}`} node={n} colors={colors} />
              ))}
            </Svg>
          </ScrollView>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
