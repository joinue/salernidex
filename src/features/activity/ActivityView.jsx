import { useMemo, useState } from 'react'
import { Activity as ActivityIcon } from 'react-feather'
import { buildActivityFeed, groupByDay } from '../../lib/activity'
import { personActions } from '../../lib/personActions'
import PageHeader from '../../components/shell/PageHeader'
import Segmented from '../../components/ui/Segmented'
import ActivityRow from './ActivityRow'
import ActionSheet from '../../components/ui/ActionSheet'
import NavBar from '../../components/ui/NavBar'
import SectionLabel from '../../components/ui/SectionLabel'
import EmptyState from '../../components/ui/EmptyState'

const KINDS = [
  { value: 'all', label: 'All' },
  { value: 'interaction', label: 'People' },
  { value: 'completion', label: 'Tasks' },
  { value: 'habit', label: 'Habits' },
  { value: 'list', label: 'Lists' },
]

// The full household activity log: every touchpoint, task completion, habit
// check-in, and list change, grouped by day. A basic audit trail reachable from
// "See all" on Today.
export default function ActivityView({
  data,
  onBack,
  onOpenPerson,
  onOpenList,
  onOpenTasks,
  onOpenHabit,
}) {
  const [filter, setFilter] = useState('all')
  const [actionPerson, setActionPerson] = useState(null)

  const feed = useMemo(() => buildActivityFeed(data), [data])
  const groups = useMemo(
    () => groupByDay(filter === 'all' ? feed : feed.filter((e) => e.kind === filter)),
    [feed, filter],
  )

  return (
    <div>
      <NavBar backLabel="Today" onBack={onBack} title="Activity">
        <PageHeader
          title="Activity"
          subtitle={`${feed.length} event${feed.length === 1 ? '' : 's'}`}
        />
      </NavBar>

      <Segmented options={KINDS} value={filter} onChange={setFilter} />

      {groups.length === 0 ? (
        <EmptyState icon={ActivityIcon}>Nothing here yet.</EmptyState>
      ) : (
        groups.map((g) => (
          <div key={g.label}>
            <SectionLabel>{g.label}</SectionLabel>
            <div className="list">
              {g.items.map((e) => (
                <ActivityRow
                  key={e.key}
                  entry={e}
                  onOpenPerson={onOpenPerson}
                  onOpenList={onOpenList}
                  onOpenTasks={onOpenTasks}
                  onOpenHabit={onOpenHabit}
                  onPersonLongPress={setActionPerson}
                />
              ))}
            </div>
          </div>
        ))
      )}

      {actionPerson && (
        <ActionSheet
          title={actionPerson.name}
          actions={personActions(actionPerson, { onOpen: onOpenPerson })}
          onClose={() => setActionPerson(null)}
        />
      )}
    </div>
  )
}
