// One-shot migration: flat src/components/*.jsx -> ui/ + shell/ + features/<area>/.
//
// Pure moves. The script rewrites every import that crosses the new folder
// boundaries (sibling imports, ../lib, ../hooks) by resolving each specifier
// against the move map and re-deriving the relative path, then fails loudly if
// any import can't be resolved. Kept as the record of how the layout was
// derived, not as something to run again.
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const ROOT = 'src'
const FROM = 'src/components'

const MAP = {
  ui: [
    'ActionSheet',
    'AddToCalendar',
    'AddressFields',
    'AlphaIndex',
    'AssigneePicker',
    'Avatar',
    'AvatarUpload',
    'ChannelEditor',
    'ConfirmDialog',
    'DatePicker',
    'Modal',
    'PressableRow',
    'PrivacyField',
    'PullToRefresh',
    'RecurrencePicker',
    'ReorderableList',
    'Segmented',
    'SharedDot',
    'Sheet',
    'SwipeRow',
    'TagInput',
    'ThemeToggle',
  ],
  shell: [
    'ErrorBoundary',
    'InstallHint',
    'MobileNav',
    'PageHeader',
    'QuickFind',
    'Sidebar',
    'Toasts',
  ],
  'features/activity': ['ActivityRow', 'ActivityView'],
  'features/auth': ['AuthScreen', 'Onboarding'],
  'features/habits': [
    'HabitDetail',
    'HabitForm',
    'HabitInsightsView',
    'HabitQuickLog',
    'HabitTemplatePicker',
    'HabitsView',
    'InsightCarousel',
  ],
  'features/lists': ['ListDetail', 'ListForm', 'ListsView'],
  'features/people': [
    'GroupForm',
    'GroupPage',
    'GroupsView',
    'InteractionForm',
    'KeyDateForm',
    'LinkEntityForm',
    'LinkTaskForm',
    'OrgForm',
    'OrgPage',
    'OrgsView',
    'PeopleMap',
    'PersonForm',
    'PersonPage',
    'ProfileNudge',
    'RelationshipForm',
    'RelationshipsView',
    'SearchView',
  ],
  'features/settings': ['ImportExport', 'LegalView', 'SettingsView'],
  'features/tasks': [
    'ProjectDetail',
    'ProjectTemplatePicker',
    'ProjectsView',
    'TaskForm',
    'TaskRow',
    'TasksView',
  ],
  'features/today': ['TodayView'],
}

// name -> new path relative to src/
const dest = {}
for (const [dir, names] of Object.entries(MAP)) {
  for (const n of names) dest[n] = `components/${dir}/${n}.jsx`
}

const existing = fs
  .readdirSync(FROM)
  .filter((f) => f.endsWith('.jsx'))
  .map((f) => f.replace('.jsx', ''))
const unmapped = existing.filter((n) => !dest[n])
if (unmapped.length) {
  console.error('Unmapped components:', unmapped.join(', '))
  process.exit(1)
}

// Move first so relative paths resolve against the new tree.
for (const [name, rel] of Object.entries(dest)) {
  const to = path.join(ROOT, rel)
  fs.mkdirSync(path.dirname(to), { recursive: true })
  execSync(`git mv "${FROM}/${name}.jsx" "${to}"`)
}

// Every file that might import a component: the moved files plus App.jsx and
// anything under hooks/ or lib/.
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : /\.jsx?$/.test(p) ? [p] : []
  })

let rewritten = 0
for (const file of walk(ROOT)) {
  const before = fs.readFileSync(file, 'utf8')
  const dir = path.dirname(file)
  const after = before.replace(/(from\s+['"])(\.[^'"]+)(['"])/g, (whole, pre, spec, post) => {
    // Absolute-ish target the specifier used to point at, from the OLD layout.
    // A moved file's old home was src/components/, so resolve its relative
    // specifiers against that; unmoved files resolve against their own dir.
    const wasMoved = Object.values(dest).some((d) => path.join(ROOT, d) === file)
    const base = wasMoved ? FROM : dir
    const target = path.normalize(path.join(base, spec))
    const name = path.basename(target).replace(/\.jsx?$/, '')
    // Only component specifiers change; lib/hooks keep their identity but
    // their relative depth changes for moved files.
    const isComponent = dest[name] && target.startsWith(FROM)
    const resolved = isComponent ? path.join(ROOT, dest[name]) : target
    if (!isComponent && !wasMoved) return whole
    let out = path.relative(dir, resolved).replace(/\.jsx$/, '')
    if (!out.startsWith('.')) out = './' + out
    return pre + out + post
  })
  if (after !== before) {
    fs.writeFileSync(file, after)
    rewritten++
  }
}
console.log(`Moved ${Object.keys(dest).length} components, rewrote imports in ${rewritten} files.`)
