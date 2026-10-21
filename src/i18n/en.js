// English dictionary, assembled from one file per area under en/.
// Each unit edits only its own area files.
import common from './en/common'
import onboarding from './en/onboarding'
import home from './en/home'
import transactions from './en/transactions'
import txform from './en/txform'
import accounts from './en/accounts'
import filter from './en/filter'
import simulations from './en/simulations'
import settings from './en/settings'
import categories from './en/categories'
import stats from './en/stats'
import report from './en/report'

// Area name → its dictionary (index.js checks for duplicate keys in development)
export const areas = { common, onboarding, home, transactions, txform, accounts, filter, simulations, settings, categories, stats, report }

export default Object.assign({}, ...Object.values(areas))
