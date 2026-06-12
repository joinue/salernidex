import { useEffect, useState } from 'react'
import { getAppPrefs, setAppPrefs, subscribeAppPrefs } from '../lib/appPrefs'

export function useAppPrefs(memberId) {
  const [prefs, set] = useState(() => getAppPrefs(memberId))
  useEffect(() => {
    set(getAppPrefs(memberId))
    return subscribeAppPrefs(() => set(getAppPrefs(memberId)))
  }, [memberId])
  const update = (patch) => setAppPrefs(memberId, patch)
  return [prefs, update]
}
