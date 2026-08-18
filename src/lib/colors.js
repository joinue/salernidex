// Preset accent colors shared by habits and lists. COLORS[0] is the default
// when nothing is chosen. The picker (components/ColorPicker.jsx) adds a custom
// swatch on top of these via the native OS color input.
export const COLORS = [
  '#34c759',
  '#0a84ff',
  '#ff9f0a',
  '#bf5af2',
  '#ff375f',
  '#5ac8fa',
  '#ffd60a',
  '#8e8e93',
]

// The colour to give something created without opening a picker — the first
// preset nobody has taken. COLORS[0] would be correct and useless: areas are
// told apart by their dot, and three greens is three areas you have to read the
// name of. Falls back to the default once every preset is spoken for; a repeat
// beats refusing to create.
export function nextColor(used = []) {
  const taken = new Set(used.filter(Boolean).map((c) => c.toLowerCase()))
  return COLORS.find((c) => !taken.has(c)) || COLORS[0]
}
