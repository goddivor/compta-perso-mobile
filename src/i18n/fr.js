// French dictionary (the reference language), assembled from one file per area under fr/.
// Each unit edits only its own area files.
import common from './fr/common'
import onboarding from './fr/onboarding'
import home from './fr/home'
import transactions from './fr/transactions'
import txform from './fr/txform'
import accounts from './fr/accounts'
import filter from './fr/filter'
import simulations from './fr/simulations'
import settings from './fr/settings'
import categories from './fr/categories'
import stats from './fr/stats'
import report from './fr/report'
import lock from './fr/lock'

// Area name → its dictionary (index.js checks for duplicate keys in development)
export const areas = { common, onboarding, home, transactions, txform, accounts, filter, simulations, settings, categories, stats, report, lock }

export default Object.assign({}, ...Object.values(areas))
