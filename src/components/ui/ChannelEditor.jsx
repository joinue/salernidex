import { X, Plus } from 'react-feather'
import IconButton from './IconButton'

// Generic editor for a labeled multi-value channel (additional emails, phones,
// or social profiles). Each item is { [field]: <select value>, value: <text> }.
// Blank rows are kept while editing; the form strips them on save via
// cleanChannels(). `placeholder` may be a string or fn(selectedValue).
export default function ChannelEditor({
  items = [],
  onChange,
  field,
  options,
  inputType = 'text',
  inputMode,
  placeholder,
  addLabel,
}) {
  const update = (i, patch) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const remove = (i) => onChange(items.filter((_, j) => j !== i))
  const add = () => onChange([...items, { [field]: options[0].value, value: '' }])
  const ph = (it) => (typeof placeholder === 'function' ? placeholder(it[field]) : placeholder)

  return (
    <div className="channel-editor">
      {items.map((it, i) => (
        <div className="channel-row" key={i}>
          <select
            className="channel-label"
            value={it[field]}
            onChange={(e) => update(i, { [field]: e.target.value })}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            className="channel-value"
            type={inputType}
            inputMode={inputMode}
            placeholder={ph(it)}
            value={it.value}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <IconButton icon={X} variant="danger" label="Remove" onClick={() => remove(i)} />
        </div>
      ))}
      <button type="button" className="channel-add" onClick={add}>
        <Plus size={14} /> {addLabel}
      </button>
    </div>
  )
}
