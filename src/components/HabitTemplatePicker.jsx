import { Edit3 } from 'react-feather'
import Sheet from './Sheet'
import { HABIT_TEMPLATES } from '../lib/habitTemplates'
import { goalLabel, cadenceLabel } from '../lib/habits'

// Short "start from…" sheet shown when creating a habit. Blank is always first
// and biggest so power users skip in one tap; templates below seed the form.
// onPick(null) → blank habit; onPick(templateHabit) → prefilled form.
export default function HabitTemplatePicker({ onPick, onClose }) {
  return (
    <Sheet title="Start from" onClose={onClose}>
      <div className="template-sheet">
        <button className="template-card blank" onClick={() => onPick(null)}>
          <span className="template-emoji">
            <Edit3 size={18} />
          </span>
          <span className="template-name">Blank habit</span>
        </button>
        {HABIT_TEMPLATES.map((t) => (
          <button key={t.id} className="template-card" onClick={() => onPick(t.habit)}>
            <span className="template-emoji" aria-hidden="true">
              {t.habit.icon}
            </span>
            <span className="template-name">{t.habit.name}</span>
            <span className="template-sub">
              {goalLabel(t.habit)} · {cadenceLabel(t.habit)}
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
