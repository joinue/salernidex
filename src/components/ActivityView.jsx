import { useMemo, useState } from 'react'
import { Activity as ActivityIcon, ArrowLeft } from 'react-feather'
import { buildActivityFeed, groupByDay } from '../lib/activity'
import { personActions } from '../lib/personActions'
import PageHeader from './PageHeader'
import Segmented from './Segmented'
import ActivityRow from './ActivityRow'
import ActionSheet from './ActionSheet'

const KINDS = [
  { value: 'all', label: 'All' },
  { value: 'interaction', label: 'People' },
  { value: 'completion', label: 'Tasks' },
  { value: 'list', label: 'Lists' },
]

// The full household activity log: every touchpoint, task completion, and list
// change, grouped by day. A basic audit trail reachable from "See all" on Today.
export default function ActivityView({ data, onBack, onOpenPerson, onOpenList, onOpenTasks }) {
  const [filter, setFilter] = useState('all')
  const [actionPerson, setActionPerson] = useState(null)

  const feed = useMemo(() => buildActivityFeed(data), [data])
  const groups = useMemo(
    () => groupByDay(filter === 'all' ? feed : feed.filter((e) => e.kind === filter)),
    [feed, filter],
  )

  return (
    <div>
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={18} /> Today
      </button>

      <PageHeader
        title="Activity"
        subtitle={`${feed.length} event${feed.length === 1 ? '' : 's'}`}
      />

      <Segmented options={KINDS} value={filter} onChange={setFilter} />

      {groups.length === 0 ? (
        <div className="empty">
          <ActivityIcon size={28} className="empty-icon" />
          Nothing here yet.
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.label}>
            <div className="section-label">{g.label}</div>
            <div className="list">
              {g.items.map((e) => (
                <ActivityRow
                  key={e.key}
                  entry={e}
                  onOpenPerson={onOpenPerson}
                  onOpenList={onOpenList}
                  onOpenTasks={onOpenTasks}
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
