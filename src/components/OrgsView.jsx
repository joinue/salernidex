import { Briefcase, ChevronRight, Plus } from 'react-feather'
import Avatar from './Avatar'
import PageHeader from './PageHeader'

export default function OrgsView({ data, onOpen, onAdd, hub }) {
  const { orgs, people, loading } = data

  if (loading) return <p className="empty dots">Loading</p>

  return (
    <div>
      <PageHeader
        title="Organizations"
        navOptions={hub?.options}
        navActive={hub?.active}
        onNavigate={hub?.onNavigate}
        action={onAdd}
        actionLabel="Add organization"
      />

      {orgs.length === 0 ? (
        <div className="empty">
          <Briefcase size={28} className="empty-icon" />
          No organizations yet.
          {onAdd && (
            <button className="text-btn" onClick={onAdd}>
              <Plus size={14} /> Add one
            </button>
          )}
        </div>
      ) : (
        <div className="list">
          {orgs.map((org) => {
            const members = people.filter((p) => !p.deleted_at && p.organization_id === org.id)
            const sub = [
              org.type,
              members.length
                ? `${members.length} ${members.length === 1 ? 'person' : 'people'}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <div className="list-row" key={org.id} onClick={() => onOpen(org.id)}>
                <Avatar
                  name={org.name}
                  src={org.avatar_url}
                  kind="org"
                  icon={Briefcase}
                  size={42}
                />
                <div className="row-body">
                  <div className="row-title">{org.name}</div>
                  {sub && <div className="row-sub">{sub}</div>}
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
