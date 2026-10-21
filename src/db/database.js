// Local SQLite database (expo-sqlite, synchronous API).
// Schema is identical to the desktop app (compta-perso) for cloud sync
// compatibility. Forecast (simulation) rows live in the SAME transactions
// table, tagged with a forecast_session_id: every "real data" query below
// filters forecast_session_id IS NULL so a simulation never leaks into the
// balances, the list, the stats, the report or the graph.
//
// v2 schema (additive only, the owner's data is never rewritten):
// - profile: singleton row (id = 1) holding country_iso2 and currency
// - accounts.operator_id / operator_dismissed: registry operator link
// - categories.icon: Ionicons name (NULL or '' = monogram fallback)
// - fee_rules: several suggestion rules per account (percent, fixed, tiers)
// Columns are added after a PRAGMA table_info check; one-shot data steps
// (fee rules from fees_rate, built-in category icons) run once, guarded by
// PRAGMA user_version.
import { openDatabaseSync } from 'expo-sqlite'

let db = null

// Current data-migration level stored in PRAGMA user_version
const DATA_VERSION = 1

export function getDb() {
  if (!db) {
    db = openDatabaseSync('compta.db')
    db.execSync('PRAGMA journal_mode = WAL')
    db.execSync('PRAGMA foreign_keys = ON')
    initSchema()
    seedDefaults()
    migrateData()
  }
  return db
}

function initSchema() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('ELECTRONIC','PHYSICAL')),
      provider TEXT,
      initial_balance REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'FCFA',
      color TEXT DEFAULT '#3B82F6',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      position INTEGER DEFAULT 0,
      fees_rate REAL DEFAULT NULL,
      operator_id TEXT DEFAULT NULL,
      operator_dismissed INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      flow TEXT NOT NULL CHECK(flow IN ('DEBIT','CREDIT','BOTH')),
      color TEXT DEFAULT '#6B7280',
      icon TEXT
    );

    CREATE TABLE IF NOT EXISTS forecast_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      validated_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      date DATETIME NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('CREDIT','DEBIT')),
      amount REAL NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      description TEXT,
      forecast_session_id INTEGER REFERENCES forecast_sessions(id) ON DELETE CASCADE,
      is_validated INTEGER DEFAULT 0,
      transfer_pair_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      fees REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      country_iso2 TEXT DEFAULT NULL,
      currency TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS fee_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT,
      kind TEXT NOT NULL CHECK(kind IN ('percent','fixed','tiers')),
      value REAL DEFAULT NULL,
      tiers TEXT DEFAULT NULL,
      position INTEGER DEFAULT 0
    );
  `)

  // Databases created by an older version: add the missing columns.
  // Only ADD COLUMN, never a drop or a rewrite (owner's data is irreplaceable).
  addColumnIfMissing('accounts', 'position', 'INTEGER DEFAULT 0')
  addColumnIfMissing('accounts', 'fees_rate', 'REAL DEFAULT NULL')
  addColumnIfMissing('accounts', 'operator_id', 'TEXT DEFAULT NULL')
  addColumnIfMissing('accounts', 'operator_dismissed', 'INTEGER DEFAULT 0')
  addColumnIfMissing('categories', 'icon', 'TEXT')
  addColumnIfMissing('transactions', 'fees', 'REAL DEFAULT 0')

  // The profile always has its single row; currency NULL = onboarding needed
  db.runSync('INSERT OR IGNORE INTO profile (id) VALUES (1)')
}

// Table and column names are constants of this file, never user input
function addColumnIfMissing(table, column, decl) {
  if (tableColumns(db, table).includes(column)) return
  db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`)
}

// Ionicons name of each built-in category, keyed by the normalized name
// (lowercase, no accents). Matches the v2 categories mockup (kit CATS).
const BUILTIN_CATEGORY_ICONS = {
  autres: 'ellipsis-horizontal',
  avance: 'hourglass-outline',
  don: 'gift-outline',
  essence: 'speedometer-outline',
  factures: 'receipt-outline',
  forfaits: 'wifi-outline',
  loisirs: 'film-outline',
  mission: 'airplane-outline',
  nourriture: 'restaurant-outline',
  participation: 'people-outline',
  perdu: 'help-circle-outline',
  recharge: 'phone-portrait-outline',
  reglement: 'checkmark-done-outline',
  remboursement: 'arrow-undo-outline',
  remuneration: 'ribbon-outline',
  retrait: 'swap-horizontal-outline',
  salaire: 'briefcase-outline',
  sante: 'medkit-outline',
  transport: 'car-outline',
  vetements: 'shirt-outline',
  freelance: 'laptop-outline',
}

function normalizeName(name) {
  return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function seedDefaults() {
  const { c } = db.getFirstSync('SELECT COUNT(*) AS c FROM categories')
  if (c > 0) return

  const cats = [
    { name: 'Nourriture', flow: 'DEBIT', color: '#F59E0B' },
    { name: 'Essence', flow: 'DEBIT', color: '#EF4444' },
    { name: 'Transport', flow: 'DEBIT', color: '#8B5CF6' },
    { name: 'Sante', flow: 'DEBIT', color: '#EC4899' },
    { name: 'Vetements', flow: 'DEBIT', color: '#06B6D4' },
    { name: 'Loisirs', flow: 'DEBIT', color: '#84CC16' },
    { name: 'Factures', flow: 'DEBIT', color: '#F97316' },
    { name: 'Salaire', flow: 'CREDIT', color: '#10B981' },
    { name: 'Freelance', flow: 'CREDIT', color: '#3B82F6' },
    { name: 'Retrait', flow: 'BOTH', color: '#6B7280' },
    { name: 'Autres', flow: 'BOTH', color: '#94A3B8' },
  ]
  for (const cat of cats) {
    db.runSync(
      'INSERT INTO categories (name, flow, color, icon) VALUES (?,?,?,?)',
      [cat.name, cat.flow, cat.color, BUILTIN_CATEGORY_ICONS[normalizeName(cat.name)] || null]
    )
  }
}

// Built-in categories without an icon get theirs. Only empty icons are
// filled; a category the user gave an icon keeps it.
function backfillCategoryIcons(d) {
  const rows = d.getAllSync("SELECT id, name FROM categories WHERE icon IS NULL OR icon = ''")
  for (const row of rows) {
    const icon = BUILTIN_CATEGORY_ICONS[normalizeName(row.name)]
    if (icon) d.runSync('UPDATE categories SET icon=? WHERE id=?', [icon, row.id])
  }
}

// Each account with a fees_rate and no fee rule gets one 'percent' rule
// carrying that rate (same fraction: 0.01 = 1 %). fees_rate is kept.
function backfillFeeRules(d) {
  const rows = d.getAllSync(`
    SELECT a.id, a.fees_rate FROM accounts a
    WHERE a.fees_rate IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM fee_rules r WHERE r.account_id = a.id)
  `)
  for (const row of rows) {
    d.runSync(
      "INSERT INTO fee_rules (account_id, name, kind, value, tiers, position) VALUES (?, NULL, 'percent', ?, NULL, 0)",
      [row.id, row.fees_rate]
    )
  }
}

// One-shot data steps, run once per database (PRAGMA user_version)
function migrateData() {
  const { user_version } = db.getFirstSync('PRAGMA user_version')
  if (user_version >= DATA_VERSION) return
  db.withTransactionSync(() => {
    backfillFeeRules(db)
    backfillCategoryIcons(db)
  })
  db.execSync(`PRAGMA user_version = ${DATA_VERSION}`)
}

/* ------------------------------- Profile ------------------------------- */

// The profile row: { country_iso2, currency, created_at, missing }.
// missing = true while no currency is set (onboarding must run).
export function getProfile() {
  const row = getDb().getFirstSync('SELECT country_iso2, currency, created_at FROM profile WHERE id = 1')
    || { country_iso2: null, currency: null, created_at: null }
  return { ...row, missing: !row.currency }
}

// Updates the profile; a field left undefined keeps its stored value.
export function setProfile({ country_iso2, currency } = {}) {
  const d = getDb()
  d.runSync('INSERT OR IGNORE INTO profile (id) VALUES (1)')
  const sets = []
  const params = []
  if (country_iso2 !== undefined) { sets.push('country_iso2=?'); params.push(country_iso2 || null) }
  if (currency !== undefined) { sets.push('currency=?'); params.push(currency || null) }
  if (sets.length) d.runSync(`UPDATE profile SET ${sets.join(', ')} WHERE id = 1`, params)
  return getProfile()
}

/* ------------------------------ Accounts ------------------------------- */

// Current balance = initial_balance + signed sum of real transactions
export function listAccounts() {
  return getDb().getAllSync(`
    SELECT a.*,
      a.initial_balance + COALESCE(
        (SELECT SUM(CASE WHEN type='CREDIT' THEN amount ELSE -amount END)
         FROM transactions WHERE account_id = a.id AND forecast_session_id IS NULL),
        0
      ) AS current_balance
    FROM accounts a
    ORDER BY position, id
  `)
}

// operator_id (optional): registry operator id, e.g. 'tg-mixx-by-yas'
export function createAccount({ name, type, provider, initial_balance, color, fees_rate, operator_id }) {
  const d = getDb()
  const r = d.runSync(
    'INSERT INTO accounts (name,type,provider,initial_balance,currency,color,fees_rate,operator_id) VALUES (?,?,?,?,?,?,?,?)',
    [name, type, provider || null, initial_balance || 0, 'FCFA', color || '#3B82F6', fees_rate ?? null, operator_id || null]
  )
  d.runSync('UPDATE accounts SET position = ? WHERE id = ?', [r.lastInsertRowId, r.lastInsertRowId])
  return r.lastInsertRowId
}

// color, fees_rate and operator_id are optional: undefined keeps the
// stored value (the v2 form has no colour field and edits fee rules apart).
export function updateAccount({ id, name, provider, initial_balance, color, fees_rate, operator_id }) {
  const sets = ['name=?', 'provider=?', 'initial_balance=?']
  const params = [name, provider || null, initial_balance || 0]
  if (color !== undefined) { sets.push('color=?'); params.push(color) }
  if (fees_rate !== undefined) { sets.push('fees_rate=?'); params.push(fees_rate ?? null) }
  if (operator_id !== undefined) { sets.push('operator_id=?'); params.push(operator_id || null) }
  getDb().runSync(`UPDATE accounts SET ${sets.join(', ')} WHERE id=?`, [...params, id])
}

// Links an account to a registry operator (null unlinks it)
export function setAccountOperator(id, operator_id) {
  getDb().runSync('UPDATE accounts SET operator_id=? WHERE id=?', [operator_id || null, id])
}

// The user dismissed (✕) the operator proposal for this account
export function dismissOperator(id) {
  getDb().runSync('UPDATE accounts SET operator_dismissed=1 WHERE id=?', [id])
}

export function deleteAccount(id) {
  getDb().runSync('DELETE FROM accounts WHERE id=?', [id])
}

/* ----------------------------- Categories ------------------------------ */

export function listCategories() {
  return getDb().getAllSync('SELECT * FROM categories ORDER BY name')
}

// icon (optional): Ionicons name; empty = monogram fallback
export function createCategory({ name, flow, color, icon }) {
  return getDb().runSync(
    'INSERT INTO categories (name, flow, color, icon) VALUES (?,?,?,?)',
    [name, flow, color || '#6B7280', icon || null]
  ).lastInsertRowId
}

// icon undefined keeps the stored icon; null or '' clears it
export function updateCategory({ id, name, flow, color, icon }) {
  const sets = ['name=?', 'flow=?', 'color=?']
  const params = [name, flow, color || '#6B7280']
  if (icon !== undefined) { sets.push('icon=?'); params.push(icon || null) }
  getDb().runSync(`UPDATE categories SET ${sets.join(', ')} WHERE id=?`, [...params, id])
}

export function getCategory(id) {
  return getDb().getFirstSync('SELECT * FROM categories WHERE id=?', [id]) || null
}

export function deleteCategory(id) {
  getDb().runSync('DELETE FROM categories WHERE id=?', [id])
}

/* ---------------------------- Transactions ----------------------------- */

// EFFECTIVE category of a transaction: its own, or (for a transfer leg)
// the one of its twin. Only ONE side of a transfer pair carries the
// category_id, so the auto-created twin must inherit it for filtering,
// display and stats — a categorized transfer never counts as
// "uncategorized". `p` is the twin joined on t.transfer_pair_id.
const EFF_CATEGORY = 'COALESCE(t.category_id, p.category_id)'

// Filters: account_ids ([] = all) + accounts_exclude, type,
// category_ids ([] = all, may contain 'none' = uncategorized) +
// categories_exclude, date_from, date_to.
// Category filters and the displayed category_name/color all use the
// EFFECTIVE category, so both legs of a categorized transfer match.
export function listTransactions(filters = {}) {
  const where = ['t.forecast_session_id IS NULL']
  const params = []

  const accountIds = filters.account_ids || []
  if (accountIds.length > 0) {
    const marks = accountIds.map(() => '?').join(',')
    where.push(`t.account_id ${filters.accounts_exclude ? 'NOT IN' : 'IN'} (${marks})`)
    params.push(...accountIds)
  }

  const catValues = filters.category_ids || []
  if (catValues.length > 0) {
    const wantNone = catValues.includes('none')
    const catIds = catValues.filter((v) => v !== 'none')
    const marks = catIds.map(() => '?').join(',')
    if (!filters.categories_exclude) {
      // Include: effective category in the list, and/or uncategorized
      const parts = []
      if (catIds.length > 0) parts.push(`${EFF_CATEGORY} IN (${marks})`)
      if (wantNone) parts.push(`${EFF_CATEGORY} IS NULL`)
      where.push(`(${parts.join(' OR ')})`)
    } else {
      // Exclude: NOT IN alone would also drop NULL rows (NULL NOT IN -> NULL),
      // so uncategorized rows are kept unless 'none' itself is excluded
      const parts = []
      if (catIds.length > 0) {
        parts.push(wantNone
          ? `(${EFF_CATEGORY} IS NOT NULL AND ${EFF_CATEGORY} NOT IN (${marks}))`
          : `(${EFF_CATEGORY} IS NULL OR ${EFF_CATEGORY} NOT IN (${marks}))`)
      } else if (wantNone) {
        parts.push(`${EFF_CATEGORY} IS NOT NULL`)
      }
      where.push(parts.join(' AND '))
    }
    params.push(...catIds)
  }

  if (filters.type) { where.push('t.type = ?'); params.push(filters.type) }
  if (filters.date_from) { where.push('date(t.date) >= ?'); params.push(filters.date_from) }
  if (filters.date_to) { where.push('date(t.date) <= ?'); params.push(filters.date_to) }

  return getDb().getAllSync(`
    SELECT t.*,
      a.name AS account_name, a.color AS account_color, a.operator_id AS account_operator_id,
      c.name AS category_name, c.color AS category_color, c.icon AS category_icon
    FROM transactions t
    LEFT JOIN transactions p ON p.id = t.transfer_pair_id
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON c.id = ${EFF_CATEGORY}
    WHERE ${where.join(' AND ')}
    ORDER BY t.date DESC, t.created_at DESC, t.id DESC
    LIMIT 500
  `, params)
}

export function getTransaction(id) {
  return getDb().getFirstSync('SELECT * FROM transactions WHERE id=?', [id]) || null
}

// For a DEBIT, amount = base amount + fees (total debited); fees = fee part.
// For a CREDIT, amount = net amount received.
export function createTransaction({ account_id, date, type, amount, fees, category_id, description }) {
  return getDb().runSync(`
    INSERT INTO transactions (account_id, date, type, amount, fees, category_id, description)
    VALUES (?,?,?,?,?,?,?)
  `, [account_id, date, type, amount, fees || 0, category_id || null, description || null]).lastInsertRowId
}

export function updateTransaction({ id, account_id, date, type, amount, fees, category_id, description }) {
  getDb().runSync(`
    UPDATE transactions
    SET account_id=?, date=?, type=?, amount=?, fees=?, category_id=?, description=?
    WHERE id=?
  `, [account_id, date, type, amount, fees || 0, category_id || null, description || null, id])
}

// Every real transaction, oldest first, no LIMIT (graph view). Slim column
// set on purpose: the graph resolves accounts itself and only needs the
// category name for the detail card.
export function listTransactionsForGraph() {
  return getDb().getAllSync(`
    SELECT t.id, t.account_id, t.date, t.type, t.amount, t.fees, t.description,
           t.transfer_pair_id, t.created_at,
           c.name AS category_name, c.icon AS category_icon
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.forecast_session_id IS NULL
    ORDER BY t.date, t.created_at, t.id
  `)
}

// Transaction count per account (quick-filter fan orders accounts by usage)
export function getAccountTxCounts() {
  return getDb().getAllSync(`
    SELECT account_id, COUNT(*) AS n
    FROM transactions
    WHERE forecast_session_id IS NULL
    GROUP BY account_id
  `)
}

// Deleting one side of a transfer deletes its partner too
export function deleteTransaction(id) {
  const d = getDb()
  const tx = d.getFirstSync('SELECT transfer_pair_id FROM transactions WHERE id=?', [id])
  if (tx?.transfer_pair_id) {
    d.runSync('DELETE FROM transactions WHERE id=? OR transfer_pair_id=?', [tx.transfer_pair_id, tx.transfer_pair_id])
  }
  d.runSync('DELETE FROM transactions WHERE id=?', [id])
}

/* ------------------------------ Transfers ------------------------------ */

// Account-to-account transfer: a pair of transactions linked through
// transfer_pair_id (each one points to the other's id).
export function createTransfer({ from_account_id, to_account_id, amount, fees, date, description }) {
  const d = getDb()
  let result = null
  d.withTransactionSync(() => {
    const totalDebit = amount + (fees || 0)
    const r1 = d.runSync(
      "INSERT INTO transactions (account_id,date,type,amount,fees,description) VALUES (?,?,'DEBIT',?,?,?)",
      [from_account_id, date, totalDebit, fees || 0, description || null]
    )
    const r2 = d.runSync(
      "INSERT INTO transactions (account_id,date,type,amount,fees,description) VALUES (?,?,'CREDIT',?,0,?)",
      [to_account_id, date, amount, description || 'Retrait reçu']
    )
    d.runSync('UPDATE transactions SET transfer_pair_id=? WHERE id=?', [r2.lastInsertRowId, r1.lastInsertRowId])
    d.runSync('UPDATE transactions SET transfer_pair_id=? WHERE id=?', [r1.lastInsertRowId, r2.lastInsertRowId])
    result = { from_tx_id: r1.lastInsertRowId, to_tx_id: r2.lastInsertRowId }
  })
  return result
}

export function updateTransfer({ debit_tx_id, credit_tx_id, from_account_id, to_account_id, amount, fees, date, description, category_id_debit, category_id_credit }) {
  const d = getDb()
  d.withTransactionSync(() => {
    const totalDebit = amount + (fees || 0)
    d.runSync(
      'UPDATE transactions SET account_id=?,date=?,amount=?,fees=?,category_id=?,description=? WHERE id=?',
      [from_account_id, date, totalDebit, fees || 0, category_id_debit || null, description || null, debit_tx_id]
    )
    d.runSync(
      'UPDATE transactions SET account_id=?,date=?,amount=?,fees=0,category_id=?,description=? WHERE id=?',
      [to_account_id, date, amount, category_id_credit || null, description || 'Retrait reçu', credit_tx_id]
    )
  })
}

// Transfer -> simple transaction: delete the partner, unlink the kept side
export function convertTransferToSimple({ keep_tx_id, delete_tx_id, account_id, type, amount, fees, category_id, date, description }) {
  const d = getDb()
  d.withTransactionSync(() => {
    d.runSync('DELETE FROM transactions WHERE id=?', [delete_tx_id])
    d.runSync(`
      UPDATE transactions
      SET account_id=?, type=?, amount=?, fees=?, category_id=?, date=?, description=?, transfer_pair_id=NULL
      WHERE id=?
    `, [account_id, type, amount, fees || 0, category_id || null, date, description || null, keep_tx_id])
  })
}

/* -------------------------------- Stats -------------------------------- */

export function getSummary() {
  const accounts = listAccounts()
  let total = 0, total_electronic = 0, total_physical = 0
  for (const a of accounts) {
    total += a.current_balance
    if (a.type === 'ELECTRONIC') total_electronic += a.current_balance
    else total_physical += a.current_balance
  }
  return { total, total_electronic, total_physical, accounts }
}

// Balance history for one account: cumulative points {date, balance}
// starting from initial_balance (desktop stats:getBalanceHistory)
export function getBalanceHistory(accountId) {
  const d = getDb()
  const account = d.getFirstSync('SELECT * FROM accounts WHERE id=?', [accountId])
  if (!account) return []

  const txs = d.getAllSync(`
    SELECT date, type, amount FROM transactions
    WHERE account_id=? AND forecast_session_id IS NULL
    ORDER BY date ASC, created_at ASC
  `, [accountId])

  let balance = account.initial_balance
  const points = [{ date: String(account.created_at || '').slice(0, 10), balance }]

  for (const tx of txs) {
    balance += tx.type === 'CREDIT' ? tx.amount : -tx.amount
    const day = String(tx.date).slice(0, 10)
    if (points[points.length - 1].date === day) {
      points[points.length - 1].balance = balance
    } else {
      points.push({ date: day, balance })
    }
  }

  return points
}

// Total DEBIT per category. Returns EVERY category (LEFT JOIN from
// categories, total 0 when unused over the period) plus an uncategorized
// row (category_id null) when uncategorized expenses exist. Sorted by
// total DESC, then alphabetically (groups the zeros at the end).
// Aggregates on the EFFECTIVE category (own or transfer twin's), so the
// debit leg of a categorized transfer never feeds "uncategorized".
export function getExpensesByCategory({ account_id, date_from, date_to } = {}) {
  // Debits with their effective category resolved once
  const src = `(
    SELECT t.id, t.amount, t.date, t.account_id,
           ${EFF_CATEGORY} AS eff_category_id
    FROM transactions t
    LEFT JOIN transactions p ON p.id = t.transfer_pair_id
    WHERE t.type='DEBIT' AND t.forecast_session_id IS NULL
  )`
  // Period/account constraints live in the JOIN clause so categories
  // without any matching transaction still come back with total 0.
  const cond = []
  const params = []
  if (account_id) { cond.push('x.account_id=?'); params.push(account_id) }
  if (date_from) { cond.push('date(x.date)>=?'); params.push(date_from) }
  if (date_to) { cond.push('date(x.date)<=?'); params.push(date_to) }

  const rows = getDb().getAllSync(`
    SELECT c.id AS category_id, c.name AS name, c.color AS color, c.icon AS icon,
           COALESCE(SUM(x.amount), 0) AS total
    FROM categories c
    LEFT JOIN ${src} x ON ${['x.eff_category_id = c.id', ...cond].join(' AND ')}
    GROUP BY c.id
  `, params)

  const none = getDb().getFirstSync(`
    SELECT SUM(x.amount) AS total
    FROM ${src} x
    WHERE x.eff_category_id IS NULL
    ${cond.length ? 'AND ' + cond.join(' AND ') : ''}
  `, params)
  if (none?.total > 0) rows.push({ category_id: null, name: null, color: null, icon: null, total: none.total })

  rows.sort(
    (a, b) => b.total - a.total || String(a.name || '￿').localeCompare(String(b.name || '￿'))
  )
  return rows
}

// Income/expenses per month, last 12 (desktop stats:getMonthlyFlow)
export function getMonthlyFlow({ account_id } = {}) {
  const where = ['t.forecast_session_id IS NULL']
  const params = []
  if (account_id) { where.push('t.account_id=?'); params.push(account_id) }

  return getDb().getAllSync(`
    SELECT strftime('%Y-%m', t.date) AS month,
      SUM(CASE WHEN t.type='CREDIT' THEN t.amount ELSE 0 END) AS income,
      SUM(CASE WHEN t.type='DEBIT'  THEN t.amount ELSE 0 END) AS expenses
    FROM transactions t
    WHERE ${where.join(' AND ')}
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `, params).reverse()
}

// Daily report: aggregate per date(date), excluding forecast
export function getDailyReport({ account_id, date_from, date_to } = {}) {
  const where = ['t.forecast_session_id IS NULL']
  const params = []
  if (account_id) { where.push('t.account_id=?'); params.push(account_id) }
  if (date_from) { where.push('date(t.date)>=?'); params.push(date_from) }
  if (date_to) { where.push('date(t.date)<=?'); params.push(date_to) }

  return getDb().getAllSync(`
    SELECT
      date(t.date)                                                     AS day,
      SUM(CASE WHEN t.type='CREDIT' THEN t.amount ELSE 0 END)          AS total_credit,
      SUM(CASE WHEN t.type='DEBIT'  THEN t.amount ELSE 0 END)          AS total_debit,
      SUM(CASE WHEN t.type='CREDIT' THEN t.amount ELSE -t.amount END)  AS net,
      COUNT(*)                                                         AS tx_count
    FROM transactions t
    WHERE ${where.join(' AND ')}
    GROUP BY date(t.date)
    ORDER BY day DESC
  `, params)
}

/* ------------------------------- Forecast ------------------------------ */
// A forecast session is a "what if" scenario: its transactions carry
// forecast_session_id = <session id> and are excluded from every real
// query above. Validating a session turns them into real transactions
// (forecast_session_id = NULL, is_validated = 1).

export function listForecastSessions() {
  return getDb().getAllSync(`
    SELECT fs.*,
      COUNT(t.id) AS tx_count,
      COALESCE(SUM(CASE WHEN t.type='CREDIT' THEN t.amount ELSE -t.amount END), 0) AS net
    FROM forecast_sessions fs
    LEFT JOIN transactions t ON t.forecast_session_id = fs.id
    GROUP BY fs.id
    ORDER BY fs.created_at DESC, fs.id DESC
  `)
}

export function createForecastSession({ name, description }) {
  return getDb().runSync(
    'INSERT INTO forecast_sessions (name, description) VALUES (?,?)',
    [name, description || null]
  ).lastInsertRowId
}

export function updateForecastSession({ id, name, description }) {
  getDb().runSync(
    'UPDATE forecast_sessions SET name=?, description=? WHERE id=?',
    [name, description || null, id]
  )
}

// Session row + its simulated transactions, enriched with the account and
// (effective) category labels so the list rows render like the real ones.
export function getForecastSession(id) {
  const d = getDb()
  const session = d.getFirstSync('SELECT * FROM forecast_sessions WHERE id=?', [id]) || null
  if (!session) return { session: null, transactions: [] }

  const transactions = d.getAllSync(`
    SELECT t.*,
      a.name AS account_name, a.color AS account_color, a.operator_id AS account_operator_id,
      c.name AS category_name, c.color AS category_color, c.icon AS category_icon
    FROM transactions t
    LEFT JOIN transactions p ON p.id = t.transfer_pair_id
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON c.id = ${EFF_CATEGORY}
    WHERE t.forecast_session_id = ?
    ORDER BY t.date ASC, t.created_at ASC, t.id ASC
  `, [id])

  return { session, transactions }
}

// Same amount/fees convention as createTransaction: a DEBIT stores
// base amount + fees, a CREDIT stores the net amount received.
export function addForecastTransaction({ session_id, account_id, date, type, amount, fees, category_id, description }) {
  return getDb().runSync(`
    INSERT INTO transactions
      (account_id, date, type, amount, fees, category_id, description, forecast_session_id)
    VALUES (?,?,?,?,?,?,?,?)
  `, [account_id, date, type, amount, fees || 0, category_id || null, description || null, session_id]).lastInsertRowId
}

// Simulated account-to-account transfer: same pair logic as createTransfer,
// both legs tagged with the session id.
export function addForecastTransfer({ session_id, from_account_id, to_account_id, amount, fees, date, description }) {
  const d = getDb()
  let result = null
  d.withTransactionSync(() => {
    const totalDebit = amount + (fees || 0)
    const r1 = d.runSync(
      "INSERT INTO transactions (account_id,date,type,amount,fees,description,forecast_session_id) VALUES (?,?,'DEBIT',?,?,?,?)",
      [from_account_id, date, totalDebit, fees || 0, description || null, session_id]
    )
    const r2 = d.runSync(
      "INSERT INTO transactions (account_id,date,type,amount,fees,description,forecast_session_id) VALUES (?,?,'CREDIT',?,0,?,?)",
      [to_account_id, date, amount, description || null, session_id]
    )
    d.runSync('UPDATE transactions SET transfer_pair_id=? WHERE id=?', [r2.lastInsertRowId, r1.lastInsertRowId])
    d.runSync('UPDATE transactions SET transfer_pair_id=? WHERE id=?', [r1.lastInsertRowId, r2.lastInsertRowId])
    result = { from_tx_id: r1.lastInsertRowId, to_tx_id: r2.lastInsertRowId }
  })
  return result
}

// The simulated transactions become real, in one SQL transaction.
export function validateForecastSession(id) {
  const d = getDb()
  d.withTransactionSync(() => {
    d.runSync('UPDATE forecast_sessions SET validated_at=CURRENT_TIMESTAMP WHERE id=?', [id])
    d.runSync(
      'UPDATE transactions SET is_validated=1, forecast_session_id=NULL WHERE forecast_session_id=?',
      [id]
    )
  })
}

// Deleting a session discards its simulated transactions
export function deleteForecastSession(id) {
  const d = getDb()
  d.withTransactionSync(() => {
    d.runSync('DELETE FROM transactions WHERE forecast_session_id=?', [id])
    d.runSync('DELETE FROM forecast_sessions WHERE id=?', [id])
  })
}

/* ------------------------------ Sync dump ------------------------------ */

export const SYNC_TABLES = ['accounts', 'categories', 'transactions', 'forecast_sessions']

export function dumpAllData() {
  const d = getDb()
  const data = {}
  for (const t of SYNC_TABLES) {
    data[t] = d.getAllSync(`SELECT * FROM ${t} ORDER BY id`)
  }
  return data
}

function tableColumns(d, table) {
  return d.getAllSync(`PRAGMA table_info(${table})`).map((c) => c.name)
}

// Replace ALL local content with the cloud payload, keeping ids.
// Foreign keys are disabled during the operation; only columns that exist
// locally are inserted (tolerates schema drift).
export function restoreAllData(data) {
  const d = getDb()
  d.execSync('PRAGMA foreign_keys = OFF')
  try {
    d.withTransactionSync(() => {
      for (const t of SYNC_TABLES) d.runSync(`DELETE FROM ${t}`)
      for (const t of SYNC_TABLES) {
        const rows = data[t] || []
        if (!rows.length) continue
        const cols = tableColumns(d, t)
        const usable = cols.filter((c) => c in rows[0])
        const sql = `INSERT INTO ${t} (${usable.join(',')}) VALUES (${usable.map(() => '?').join(',')})`
        for (const row of rows) {
          d.runSync(sql, usable.map((c) => row[c] ?? null))
        }
      }
    })
  } finally {
    d.execSync('PRAGMA foreign_keys = ON')
  }
}
