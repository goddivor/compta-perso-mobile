// Accent- and case-insensitive search over registry entries.
// Operators: every word typed must be the START of a word of the name or of
// one alias ("ora" → Orabank, "yas mon" → Yas Money, "societe gen" →
// Société Générale). Results ranked: name prefix, name word, alias; active first.

const FALLBACK = { à: 'a', â: 'a', ä: 'a', á: 'a', ã: 'a', å: 'a', ç: 'c', é: 'e', è: 'e', ê: 'e', ë: 'e', í: 'i', ì: 'i', î: 'i', ï: 'i', ñ: 'n', ó: 'o', ò: 'o', ô: 'o', ö: 'o', õ: 'o', ú: 'u', ù: 'u', û: 'u', ü: 'u', ý: 'y', ÿ: 'y', œ: 'oe', æ: 'ae' }
const canNormalize = (() => { try { return 'é'.normalize('NFD').length === 2 } catch { return false } })()

// 'Société Générale' → 'societe generale'
export function normalizeText(s) {
  const low = String(s ?? '').toLowerCase()
  return canNormalize
    ? low.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    : low.replace(/[^\u0000-\u007f]/g, (c) => FALLBACK[c] ?? c)
}

const words = (s) => normalizeText(s).split(/[^a-z0-9]+/).filter(Boolean)

// Every query word starts some word of the text
function wordPrefix(qWords, text) {
  const w = words(text)
  return qWords.every((q) => w.some((x) => x.startsWith(q)))
}

const STATUS_RANK = { active: 0, rebranded: 1, merged: 2, defunct: 3 }

// Operators matching a query, best first. Empty query → [] (callers show their default list).
export function searchOperators(operators, query, { limit = 50 } = {}) {
  const q = words(query)
  if (!q.length || !operators) return []
  const full = normalizeText(query).trim()
  const hits = []
  for (const op of operators) {
    let rank = null
    if (normalizeText(op.name).startsWith(full)) rank = 0
    else if (wordPrefix(q, op.name)) rank = 1
    else if ((op.aliases || []).some((a) => wordPrefix(q, a))) rank = 2
    if (rank != null) hits.push({ op, rank, status: STATUS_RANK[op.status] ?? 4 })
  }
  hits.sort((a, b) => a.status - b.status || a.rank - b.rank || a.op.name.localeCompare(b.op.name))
  return hits.slice(0, limit).map((h) => h.op)
}

// The operator an account name most likely means, or null when unsure:
// the name equals an operator name or alias, or is a word prefix of exactly one
export function suggestOperator(operators, accountName) {
  const n = normalizeText(accountName).replace(/[^a-z0-9]+/g, ' ').trim()
  if (!n || !operators) return null
  const same = (s) => normalizeText(s).replace(/[^a-z0-9]+/g, ' ').trim() === n
  const active = operators.filter((o) => (o.status || 'active') === 'active')
  const exact = active.find((o) => same(o.name) || (o.aliases || []).some(same))
  if (exact) return exact
  const hits = searchOperators(active, accountName, { limit: 2 })
  return hits.length === 1 ? hits[0] : null
}

// Countries matching a query on their name in the app language (and English), by name
export function searchCountries(countries, query, lang = 'fr') {
  const q = words(query)
  const list = countries || []
  const name = (c) => c.name[lang] || c.name.en
  const out = q.length ? list.filter((c) => wordPrefix(q, name(c)) || wordPrefix(q, c.name.en) || normalizeText(c.iso2) === normalizeText(query).trim()) : [...list]
  return out.sort((a, b) => name(a).localeCompare(name(b), lang))
}
