import { useEffect, useState } from 'react'
import { getPrefs, setPrefs, subscribePrefs } from '../lib/notifyPrefs'

export function useNotificationPrefs(memberId) {
  const [prefs, set] = useState(() => getPrefs(memberId))
  useEffect(() => {
    set(getPrefs(memberId))
    return subscribePrefs(() => set(getPrefs(memberId)))
  }, [memberId])
  const update = (patch) => setPrefs(memberId, patch)
  return [prefs, update]
}
