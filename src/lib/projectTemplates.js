// Starter project templates — a curated pool that turns "New project" from a
// blank page into a scaffold. The same idea as lib/habitTemplates.js, one level
// up: a template is a *preset over the primitives a project already has* —
// phase headings, a few starter subtasks, scoped list(s), suggested link roles,
// and a notes hint. Nothing here is a new concept; it's all data.
//
// Templates STAMP ONCE, then forget: instantiating one creates ordinary rows
// (a project task + heading/subtask rows + lists scoped via project_id) and
// leaves no live link. Edit the project freely afterwards — it's just a project.
//
// Design law held here on purpose: scaffold structure, don't pre-fill clutter.
// ≤4 starter tasks per template — the phases and the scoped list are the value;
// the user fills in the specifics. Adding a new template (Wedding, New Baby,
// Garden, …) is a pure data append; no schema or code changes.
//
// Shape:
//   { id, name, icon, dateRange, notesHint,
//     phases: [{ title, tasks: [string] }],   // title → heading row; tasks follow it
//     lists:  [{ name, icon, kind }],          // 'standard' | 'grocery'
//     suggestedRoles: [string] }               // pre-fill hints for the link form

export const PROJECT_TEMPLATES = [
  {
    id: 'trip',
    name: 'Trip',
    icon: '✈️',
    dateRange: true,
    notesHint: 'Confirmation #s, addresses, reservations…',
    phases: [
      {
        title: 'Before you go',
        tasks: ['Book travel', 'Book lodging', 'Arrange pet/house sitter'],
      },
      { title: 'While there', tasks: [] },
    ],
    lists: [{ name: 'Packing', icon: '🧳', kind: 'standard' }],
    suggestedRoles: ['Travel companion'],
  },
  {
    id: 'home-reno',
    name: 'Home Renovation',
    icon: '🔨',
    dateRange: true,
    notesHint: 'Measurements, paint codes, permit #s…',
    phases: [
      { title: 'Planning', tasks: ['Set budget', 'Get quotes'] },
      { title: 'Demo', tasks: [] },
      { title: 'Build', tasks: [] },
      { title: 'Finishes', tasks: ['Final walkthrough'] },
    ],
    lists: [{ name: 'Materials', icon: '🧱', kind: 'standard' }],
    suggestedRoles: ['Contractor', 'Designer'],
  },
  {
    id: 'event',
    name: 'Event',
    icon: '🎉',
    dateRange: false,
    notesHint: 'Venue, theme, run-of-show…',
    phases: [
      { title: 'Plan', tasks: ['Set date & guest list', 'Set budget'] },
      { title: 'Invite', tasks: ['Send invitations'] },
      { title: 'Prep', tasks: [] },
      { title: 'Day-of', tasks: [] },
    ],
    lists: [
      { name: 'Guests', icon: '👥', kind: 'standard' },
      { name: 'Shopping', icon: '🛒', kind: 'grocery' },
    ],
    suggestedRoles: ['Co-host', 'Vendor'],
  },
  {
    id: 'move',
    name: 'Move',
    icon: '📦',
    dateRange: true,
    notesHint: 'New address, lease dates, utility contacts…',
    phases: [
      { title: '8 weeks out', tasks: ['Book movers', 'Sort & declutter'] },
      { title: 'Packing', tasks: [] },
      { title: 'Moving day', tasks: [] },
      { title: 'Settle in', tasks: ['Change address'] },
    ],
    lists: [{ name: 'Packing', icon: '📦', kind: 'standard' }],
    suggestedRoles: ['Moving company'],
  },
  {
    id: 'holiday',
    name: 'Holiday',
    icon: '🎄',
    dateRange: false,
    notesHint: 'Traditions, who’s hosting, dietary notes…',
    phases: [
      { title: 'Plan', tasks: ['Set menu', 'Make gift list'] },
      { title: 'Shop', tasks: [] },
      { title: 'Prep', tasks: [] },
    ],
    lists: [
      { name: 'Gifts', icon: '🎁', kind: 'standard' },
      { name: 'Menu', icon: '🍽️', kind: 'grocery' },
      { name: 'Cards', icon: '💌', kind: 'standard' },
    ],
    suggestedRoles: [],
  },
  {
    id: 'job-search',
    name: 'Job Search',
    icon: '💼',
    dateRange: false,
    notesHint: 'Salary target, must-haves, application log…',
    phases: [
      { title: 'Prep', tasks: ['Update résumé', 'Refresh LinkedIn'] },
      { title: 'Apply', tasks: [] },
      { title: 'Interview', tasks: [] },
    ],
    lists: [{ name: 'Target companies', icon: '🏢', kind: 'standard' }],
    suggestedRoles: ['Recruiter', 'Reference'],
  },
]

// The always-present "start from scratch" option. Shaped like a template so the
// picker's review step and buildProjectRows treat it uniformly.
export const BLANK_TEMPLATE = {
  id: 'blank',
  name: 'Project',
  icon: '📁',
  dateRange: false,
  notesHint: '',
  phases: [],
  lists: [],
  suggestedRoles: [],
}

// Turn a template (+ the review step's overrides) into the rows to stamp out.
// Returns { project, children, lists } — plain field objects. The caller fills
// in the generated parent_id / project_id (addTask returns its id synchronously,
// so it can chain): addTask(project) → addTask(child, parent_id) → saveList(list,
// project_id). Headings become is_heading rows; the tasks listed under a phase
// follow it in manual order, exactly like ProjectDetail builds them by hand.
export function buildProjectRows(template, opts = {}) {
  const {
    name = template.name,
    notes = '',
    privacy_level = 'shared',
    assignee = 'anyone',
    start_date = null,
    end_date = null,
    phases = template.phases || [],
    lists = template.lists || [],
  } = opts

  const project = {
    title: name.trim() || template.name,
    notes,
    is_project: true,
    project_status: 'active',
    privacy_level,
    assignee,
    start_date,
    end_date,
  }

  const children = []
  let order = 1
  for (const phase of phases) {
    if (phase.title) {
      children.push({
        title: phase.title,
        is_heading: true,
        sort_order: order++,
        privacy_level,
        assignee,
      })
    }
    for (const title of phase.tasks || []) {
      if (title && title.trim()) {
        children.push({ title: title.trim(), sort_order: order++, privacy_level, assignee })
      }
    }
  }

  // Scoped lists inherit the project's privacy so a private project never leaks
  // a family-shared packing list. project_id is filled in by the caller.
  const listSpecs = lists.map((l) => ({ ...l, privacy_level }))

  return { project, children, lists: listSpecs }
}
