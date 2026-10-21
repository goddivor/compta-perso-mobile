// Official fee grids an account can import into a tiers rule with one tap.
// Each grid keeps its source and the date it came into force.
// tiers: [[max amount, fee], …] in FCFA, sorted by max.

// Mixx by Yas Togo, cash withdrawals: 22 tiers from 50 to 9 700 FCFA.
export const MIXX_BY_YAS_RETRAIT = {
  id: 'mixx-by-yas-retrait',
  operatorId: 'tg-mixx-by-yas',
  source: 'https://levisionnaire.tg/mixx-by-yas-togo-nouvelle-grille-tarifaire-pour-les-retraits-dargent/',
  since: '2025-01-31',
  tiers: [
    [500, 50], [5000, 100], [20000, 300], [50000, 600], [100000, 1000], [200000, 3100], [300000, 3700],
    [500000, 4200], [850000, 4400], [900000, 4600], [950000, 4900], [1000000, 5100], [1100000, 5400],
    [1150000, 5900], [1200000, 6200], [1250000, 6500], [1300000, 6800], [1350000, 7000], [1400000, 7300],
    [1450000, 7600], [1500000, 7800], [2000000, 9700],
  ],
}
