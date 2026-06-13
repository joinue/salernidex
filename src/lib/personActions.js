import { ArrowRight, Check, Edit2, Phone, Mail } from 'react-feather'

// Standard quick-action set for a person, used by long-press action sheets so
// the menu is identical everywhere. Handlers are wired by the caller; entries
// only appear when the relevant data/handler exists.
export function personActions(person, { onOpen, onLog, onEdit } = {}) {
  const actions = []
  if (onOpen)
    actions.push({ label: 'Open profile', icon: ArrowRight, onClick: () => onOpen(person.id) })
  if (onLog) actions.push({ label: 'Log touchpoint', icon: Check, onClick: () => onLog(person) })
  if (onEdit) actions.push({ label: 'Edit', icon: Edit2, onClick: () => onEdit(person) })
  if (person.phone)
    actions.push({
      label: 'Call',
      icon: Phone,
      onClick: () => {
        window.location.href = `tel:${person.phone}`
      },
    })
  if (person.email)
    actions.push({
      label: 'Email',
      icon: Mail,
      onClick: () => {
        window.location.href = `mailto:${person.email}`
      },
    })
  return actions
}
