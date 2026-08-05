import Segmented from './Segmented'
import { isSolo } from '../../lib/household'
import { PRIVATE_LEVEL } from '../../lib/privacy'

// Private/Shared control for entity forms. Progressive disclosure: renders
// nothing in a solo household (lib/household.isSolo) — there's no one to share
// with, so the form should default new items to PRIVATE_LEVEL and not ask. Once
// a second member joins, the control appears.
//
// Binary by design: writes 'shared' or 'private'. Legacy 'family_shared' /
// 'public' values land on the "Shared" segment and are left untouched unless
// the user actually toggles (the visibility rule already treats them as shared).
const SHARED = 'shared'

export default function PrivacyField({ value, onChange, label = 'Visibility' }) {
  if (isSolo()) return null
  return (
    <div className="field">
      <label className="label">{label}</label>
      <Segmented
        options={[
          { value: SHARED, label: 'Shared' },
          { value: PRIVATE_LEVEL, label: 'Private' },
        ]}
        value={value === PRIVATE_LEVEL ? PRIVATE_LEVEL : SHARED}
        onChange={onChange}
      />
    </div>
  )
}
