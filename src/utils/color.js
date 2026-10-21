// Colour helpers for USER DATA colours (account / category `color` column).
// Never use these to invent UI colours: those come from theme tokens.

// '#RGB' | '#RRGGBB' + alpha (0..1) → 'rgba(r,g,b,a)'; other strings pass through
export function withAlpha(color, alpha) {
  if (typeof color !== 'string') return color
  let h = color.trim().replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return color
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}
