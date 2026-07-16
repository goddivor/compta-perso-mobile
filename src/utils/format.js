// Currency and date formatting helpers (fr-FR)

export const fmt = (n) =>
  new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' FCFA'

export const fmtSigned = (type, n) =>
  (type === 'CREDIT' ? '+' : '-') + fmt(n)

export const fmtDate = (s) =>
  s ? new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('fr-FR') : '—'

// Long day label for list group headers, e.g. "mercredi 16 juillet 2026"
export const fmtDay = (day) => {
  if (!day) return '—'
  const d = new Date(day + 'T00:00:00')
  const label = d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export const fmtDateTime = (s) =>
  s ? new Date(s).toLocaleString('fr-FR') : '—'

export const today = () => {
  const d = new Date()
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Shift an ISO day string (YYYY-MM-DD) by n days
export const shiftDay = (iso, n) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const isValidDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s + 'T00:00:00').getTime())
