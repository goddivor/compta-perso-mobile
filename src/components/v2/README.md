# v2 shared components

Import from `src/components/v2`. Props are final: a change goes through the foundation unit.
Colours come from `useTheme()`; user colours (`color` of an account or category) are data.
Text comes from `common.*` keys only, so screen units never need these files.

| Component | Props | Notes |
|---|---|---|
| `Fab` | `onPress`, `icon = 'add'`, `accessibilityLabel`, `style` | 56 dp, radius 16, bottom-right 16. The only way to add. |
| `EmptyState` | `icon`, `title`, `action?: { label, onPress, icon?, variant?: 'primary' \| 'tonal', busy? }`, `style` | Centred in the free space, above the keyboard. `action.busy`: spinner in place of the icon, button disabled. In a FlatList: `ListEmptyComponent` + `contentContainerStyle={{ flexGrow: 1 }}`. |
| `LogoTile` | `operatorId`, `name`, `color`, `icon`, `size = 40`, `style` | Registry logo on the white tile (fills it when drawn on its own coloured block). No logo: `icon` (e.g. `'cash-outline'` for a PHYSICAL account) or the initial of `name`, in `color`. |
| `CategoryIcon` | `icon`, `name`, `color`, `size = 40`, `transfer = false`, `style` | Circle, Ionicons `icon` or the initial of `name`. `transfer` = blue swap avatar. |
| `Amount` | `value`, `type?: 'DEBIT' \| 'CREDIT'`, `size = 15`, `weight = 'semibold'`, `currency = true`, `color`, `style`, `numberOfLines = 1` | Debit red "−", credit green "+", no type = balance in ink. Currency symbol on the side and with the spacing of the profile country's amount format (`fmtParts`), none before onboarding. Masked when the user hides amounts. |
| `Chip` | `label`, `selected`, `onPress`, `leading`, `style` | 32 dp. Selected = yellow tint + check. Periods, fee suggestions. |
| `TriChip` | `label`, `state: 'neutral' \| 'include' \| 'exclude'`, `onPress`, `leading`, `style` | Account and category filters; the parent cycles the state. |
| `Select` | `label`, `value`, `options: [{ value, label, leading? }]`, `onChange(value)`, `placeholder`, `placeholderLeading`, `disabled`, `style` | Field + menu anchored under it (above when no room). |
| `ConfirmDialog` | `visible`, `title`, `body`, `icon = 'trash-outline'`, `tone: 'danger' \| 'primary'`, `confirmLabel`, `cancelLabel`, `onConfirm`, `onCancel`, `busy` | Every delete, restore, pull or reset. Body = one line (the item concerned). |
| `TransactionRow` | `tx`, `pair?`, `onPress(tx)`, `onLongPress(tx)`, `showDate = false`, `sub?`, `style` | `tx` = a `listTransactions()` row. `pair` = the other leg: one transfer row. `sub` replaces the fee line (e.g. a running balance). Memoized: stable callbacks. |
| `Flag` | `iso2`, `size = 20`, `style` | Round registry flag. |
| `CurrencySign` | `code`, `size = 24`, `color`, `colored = false`, `style` | Registry sign SVG (XOF emblem), else its text. |

## Around them

- **Tokens** (`theme/tokens.js`): `primarySoft`, `logoTile`, `logoTileDark`, `logoTileEdge`, `scrim`;
  `radius.xxl 24 · sheet 28 · pill 999`; `shadowFab`. Debits `danger`, credits `success`, balances `ink`.
- **Registry** (`src/registry`): `getCountries`, `getCountry`, `getCurrencies`, `getCurrency`,
  `currencySymbol`, `currencyLabel` (symbol, ISO code fallback), `getOperators`, `getOperator`, `peekOperator`, `operatorCountry`, `getSvg`,
  `getLogo`, `searchOperators`, `suggestOperator`, `searchCountries`, `normalizeText`, `logoLayout`;
  hooks `useCountries`, `useCountry`, `useCurrencies`, `useCurrency`, `useOperators`, `useOperator`,
  `useSvg`, `useLogo` → `{ data, loading, error, retry }` (`error.code`: `offline` | `not_found`).
- **Utils**: `utils/dates` `shortDate`, `monthKey`, `monthRange`, `recentMonths`; `utils/fees`
  `computeFee`, `feeSuggestions`, `feeRuleLabel`; `utils/format` `fmtParts`, `CURRENCY_LABEL` (live); `utils/filters`;
  `utils/color` `withAlpha` (user colours only).
- **Contexts**: `useFilters()` (see `context/FiltersContext.js`), `usePrivacy()` (hide amounts),
  `useCurrencyLabel()` (profile currency label) and `useAmountFormat()` (`context/CurrencyContext.js`).
- **Hooks**: `useProfile()`, `useKeyboardHeight()`.
