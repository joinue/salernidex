import Avatar from './Avatar'
import { assigneeOptions } from '../lib/household'

// Pick who a task is for: "Anyone" or a specific household member. Scales to N
// members (a segmented control doesn't), shown as selectable avatar chips.
export default function AssigneePicker({ value, onChange }) {
  const options = assigneeOptions()
  return (
    <div className="assignee-row">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          className={`assignee-chip ${value === o.value ? 'on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.value === 'anyone' ? (
            <span className="assignee-any">Any</span>
          ) : (
            <Avatar name={o.label} size={22} />
          )}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}
