// Local SQLite database (expo-sqlite, synchronous API).
// Schema is identical to the desktop app (compta-perso) for cloud sync
// compatibility. Forecast is not ported in v1 but its table exists and
// every query filters forecast_session_id IS NULL.
import { openDatabaseSync } from 'expo-sqlite'

let db = null

export function getDb() {
  if (!db) {
    db = openDatabaseSync('compta.db')
    db.execSync('PRAGMA journal_mode = WAL')
    db.execSync('PRAGMA foreign_keys = ON')
    initSchema()
    seedDefaults()
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
      fees_rate REAL DEFAULT NULL
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
  `)
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
      [cat.name, cat.flow, cat.color, '']
    )
  }
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

export function createAccount({ name, type, provider, initial_balance, color, fees_rate }) {
  const d = getDb()
  const r = d.runSync(
    'INSERT INTO accounts (name,type,provider,initial_balance,currency,color,fees_rate) VALUES (?,?,?,?,?,?,?)',
    [name, type, provider || null, initial_balance || 0, 'FCFA', color || '#3B82F6', fees_rate ?? null]
  )
  d.runSync('UPDATE accounts SET position = ? WHERE id = ?', [r.lastInsertRowId, r.lastInsertRowId])
  return r.lastInsertRowId
}

export function updateAccount({ id, name, provider, initial_balance, color, fees_rate }) {
  getDb().runSync(
    'UPDATE accounts SET name=?, provider=?, initial_balance=?, color=?, fees_rate=? WHERE id=?',
    [name, provider || null, initial_balance || 0, color, fees_rate ?? null, id]
  )
}

export function deleteAccount(id) {
  getDb().runSync('DELETE FROM accounts WHERE id=?', [id])
}

/* ----------------------------- Categories ------------------------------ */

export function listCategories() {
  return getDb().getAllSync('SELECT * FROM categories ORDER BY name')
}

export function createCategory({ name, flow, color }) {
  return getDb().runSync(
    'INSERT INTO categories (name, flow, color, icon) VALUES (?,?,?,?)',
    [name, flow, color || '#6B7280', '']
  ).lastInsertRowId
}

export function deleteCategory(id) {
  getDb().runSync('DELETE FROM categories WHERE id=?', [id])
}

/* ---------------------------- Transactions ----------------------------- */

export function listTransactions(filters = {}) {
  const where = ['t.forecast_session_id IS NULL']
  const params = []
  if (filters.account_id) { where.push('t.account_id = ?'); params.push(filters.account_id) }
  if (filters.category_id) { where.push('t.category_id = ?'); params.push(filters.category_id) }
  if (filters.type) { where.push('t.type = ?'); params.push(filters.type) }
  if (filters.date_from) { where.push('date(t.date) >= ?'); params.push(filters.date_from) }
  if (filters.date_to) { where.push('date(t.date) <= ?'); params.push(filters.date_to) }

  return getDb().getAllSync(`
    SELECT t.*,
      a.name AS account_name, a.color AS account_color,
      c.name AS category_name, c.color AS category_color
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id
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
           c.name AS category_name
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

// Total DEBIT per category (desktop stats:getExpensesByCategory)
export function getExpensesByCategory({ account_id, date_from, date_to } = {}) {
  const where = ["t.type='DEBIT'", 't.forecast_session_id IS NULL']
  const params = []
  if (account_id) { where.push('t.account_id=?'); params.push(account_id) }
  if (date_from) { where.push('date(t.date)>=?'); params.push(date_from) }
  if (date_to) { where.push('date(t.date)<=?'); params.push(date_to) }

  return getDb().getAllSync(`
    SELECT COALESCE(c.name,'Sans catégorie') AS name,
           COALESCE(c.color,'#6B7280') AS color,
           SUM(t.amount) AS total
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE ${where.join(' AND ')}
    GROUP BY t.category_id
    ORDER BY total DESC
  `, params)
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
