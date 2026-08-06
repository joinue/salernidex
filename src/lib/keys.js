// Shared guard for window-level keyboard shortcuts.
//
// Every global hotkey in the app listens on `window`, which means it also fires
// while you are typing. Without this check ⌘B collapsed the sidebar mid-sentence
// instead of bolding the word (the note editor gets bold/italic/underline free
// from contentEditable, so stealing the key breaks it), and ⌘N opened the
// new-contact form from inside a note. A shortcut that isn't the field's own
// should bail out whenever the event came from somewhere text is being entered.
export function isEditableTarget(el) {
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
