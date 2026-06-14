import { Users, ChevronRight, Plus } from 'react-feather'
import { groupMembers, describeGroup } from '../lib/groups'
import Avatar from './Avatar'
import PageHeader from './PageHeader'

export default function GroupsView({ data, onOpen, onAdd, hub }) {
  const { groups, people, loading } = data

  if (loading) return <p className="empty dots">Loading</p>

  return (
    <div>
      <PageHeader
        title="Groups"
        navOptions={hub?.options}
        navActive={hub?.active}
        onNavigate={hub?.onNavigate}
        infoTitle="How groups work"
        info="A group is people you pick — or, if you'd rather, everyone matching a set of tags. Hand-picked groups stay exactly as you set them. Tag-based (smart) groups update themselves: add the tag to a person and they join, remove it and they leave."
        action={onAdd}
        actionLabel="New group"
      />

      {groups.length === 0 ? (
        <div className="empty">
          <Users size={28} className="empty-icon" />
          No groups yet.
          <button className="text-btn" onClick={onAdd}>
            <Plus size={14} /> New group
          </button>
        </div>
      ) : (
        <div className="list">
          {groups.map((group) => {
            const members = groupMembers(group, people)
            return (
              <div className="list-row" key={group.id} onClick={() => onOpen(group.id)}>
                <Avatar
                  name={group.name}
                  src={group.avatar_url}
                  kind="group"
                  icon={Users}
                  size={42}
                />
                <div className="row-body">
                  <div className="row-title">{group.name}</div>
                  <div className="row-sub">
                    {members.length} {members.length === 1 ? 'person' : 'people'} ·{' '}
                    {describeGroup(group)}
                  </div>
                </div>
                <ChevronRight size={18} className="row-chevron" />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
