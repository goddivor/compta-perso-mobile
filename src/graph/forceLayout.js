// Pure-JS force-directed layout — Fruchterman-Reingold (1991), no deps.
// Inspired by the Flutter "graphview" package (FruchtermanReingoldAlgorithm):
// repulsion between every node pair, attraction along edges, linear cooling.
//
// Input:  nodes  [{ id, weight?, group? }]  (group = account id, used only
//                for the deterministic initial placement)
//         edges  [{ from, to, kind }]       (kind 'chain' | 'transfer')
// Output: { positions: { [id]: { x, y } }, bounds: { width, height } }
// Positions are normalized so the bounding box starts at (0, 0).

export function computeForceLayout({ nodes, edges, iterations = 300 }) {
  const n = nodes.length
  if (n === 0) return { positions: {}, bounds: { width: 0, height: 0 } }

  // Virtual surface sized with the node count so density stays comfortable
  const side = 1200 + n * 60
  const W = side
  const H = side
  const k = 0.9 * Math.sqrt((W * H) / n)
  const cx = W / 2
  const cy = H / 2

  const index = new Map()
  nodes.forEach((node, i) => index.set(node.id, i))

  const xs = new Float64Array(n)
  const ys = new Float64Array(n)

  // Deterministic initial positions (no Math.random): each group (account)
  // gets a base angle, its nodes spiral outward on concentric circles.
  // Same data in -> same layout out, stable between two app launches.
  const groups = [...new Set(nodes.map((nd) => nd.group ?? 0))]
  const groupAngle = new Map()
  groups.forEach((g, gi) => groupAngle.set(g, (2 * Math.PI * gi) / groups.length))
  const seen = new Map()
  nodes.forEach((node, i) => {
    const g = node.group ?? 0
    const j = seen.get(g) || 0
    seen.set(g, j + 1)
    const a = groupAngle.get(g) + j * 0.35
    const r = side * 0.08 + j * (k * 0.45)
    xs[i] = cx + r * Math.cos(a)
    ys[i] = cy + r * Math.sin(a)
  })

  // Edges as index pairs; chronological chain edges attract 1.5x harder so
  // each account thread stays visually grouped.
  const eFrom = []
  const eTo = []
  const eBoost = []
  for (const e of edges) {
    const a = index.get(e.from)
    const b = index.get(e.to)
    if (a == null || b == null || a === b) continue
    eFrom.push(a)
    eTo.push(b)
    eBoost.push(e.kind === 'chain' ? 1.5 : 1)
  }

  const dx = new Float64Array(n)
  const dy = new Float64Array(n)
  const t0 = W / 10
  const EPS = 0.01

  for (let iter = 0; iter < iterations; iter++) {
    // Temperature cools linearly from W/10 down to 1
    const temp = t0 + (1 - t0) * (iter / iterations)
    dx.fill(0)
    dy.fill(0)

    // Repulsion between every pair: f_r(d) = k^2 / d
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let vx = xs[i] - xs[j]
        let vy = ys[i] - ys[j]
        let d = Math.sqrt(vx * vx + vy * vy)
        if (d < EPS) {
          // Deterministic tie-break when two points coincide
          vx = ((i - j) % 3) + 0.1
          vy = ((i + j) % 3) - 0.1
          d = Math.sqrt(vx * vx + vy * vy)
        }
        const f = (k * k) / d
        const fx = (vx / d) * f
        const fy = (vy / d) * f
        dx[i] += fx
        dy[i] += fy
        dx[j] -= fx
        dy[j] -= fy
      }
    }

    // Attraction along edges: f_a(d) = d^2 / k
    for (let e = 0; e < eFrom.length; e++) {
      const a = eFrom[e]
      const b = eTo[e]
      let vx = xs[a] - xs[b]
      let vy = ys[a] - ys[b]
      let d = Math.sqrt(vx * vx + vy * vy)
      if (d < EPS) d = EPS
      const f = ((d * d) / k) * eBoost[e]
      const fx = (vx / d) * f
      const fy = (vy / d) * f
      dx[a] -= fx
      dy[a] -= fy
      dx[b] += fx
      dy[b] += fy
    }

    // Light gravity toward the center so isolated components (accounts with
    // no transfer between them) do not drift apart forever.
    for (let i = 0; i < n; i++) {
      dx[i] += 0.03 * (cx - xs[i])
      dy[i] += 0.03 * (cy - ys[i])
    }

    // Displacement capped by the temperature, positions kept inside the
    // virtual frame (classic Fruchterman-Reingold frame clamp)
    for (let i = 0; i < n; i++) {
      const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i])
      if (d < EPS) continue
      const step = Math.min(d, temp)
      xs[i] = Math.min(W, Math.max(0, xs[i] + (dx[i] / d) * step))
      ys[i] = Math.min(H, Math.max(0, ys[i] + (dy[i] / d) * step))
    }
  }

  // Density normalization: rescale so the mean edge length lands around a
  // comfortable value versus the node radii (16..34 px), whatever n is.
  if (eFrom.length > 0) {
    let sum = 0
    for (let e = 0; e < eFrom.length; e++) {
      sum += Math.hypot(xs[eFrom[e]] - xs[eTo[e]], ys[eFrom[e]] - ys[eTo[e]])
    }
    const mean = sum / eFrom.length
    if (mean > EPS) {
      const s = Math.min(3, Math.max(0.02, 150 / mean))
      for (let i = 0; i < n; i++) {
        xs[i] = cx + (xs[i] - cx) * s
        ys[i] = cy + (ys[i] - cy) * s
      }
    }
  }

  // Normalize: shift so the bounding box starts at (0, 0)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < n; i++) {
    if (xs[i] < minX) minX = xs[i]
    if (ys[i] < minY) minY = ys[i]
    if (xs[i] > maxX) maxX = xs[i]
    if (ys[i] > maxY) maxY = ys[i]
  }

  const positions = {}
  nodes.forEach((node, i) => {
    positions[node.id] = { x: xs[i] - minX, y: ys[i] - minY }
  })

  return { positions, bounds: { width: maxX - minX, height: maxY - minY } }
}
