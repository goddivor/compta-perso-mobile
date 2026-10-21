// The profile row (country + currency), re-read after every data change.
// → { country_iso2, currency, created_at, missing }
import { useMemo } from 'react'
import { getProfile } from '../db/database'
import { useTick } from '../context/AppContext'

export function useProfile() {
  const tick = useTick()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getProfile(), [tick])
}
