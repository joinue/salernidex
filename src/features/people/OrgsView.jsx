import { Briefcase, ChevronRight, Plus } from 'react-feather'
import Avatar from '../../components/ui/Avatar'
import PageHeader from '../../components/shell/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import { orgMembers } from '../../lib/orgs'

export default function OrgsView({ data, onOpen, onAdd, hub }) {
  const { orgs, people, affiliations, loading } = data

  if (loading) return <EmptyState loading>Loading</EmptyState>

  return (
    <div>
      <PageHeader
        title="Organizations"
        navOptions={hub?.options}
        navActive={hub?.active}
        onNavigate={hub?.onNavigate}
        createAction={onAdd}
        actionLabel="Add organization"
      />

      {orgs.length === 0 ? (
        <EmptyState icon={Briefcase}>
          No organizations yet.
          {onAdd && (
            <button className="text-btn" onClick={onAdd}>
              <Plus size={14} /> Add one
            </button>
          )}
        </EmptyState>
      ) : (
        <div className="list">
          {orgs.map((org) => {
            const members = orgMembers(org.id, people, affiliations)
            const sub = [
              org.type,
              members.length
                ? `${members.length} ${members.length === 1 ? 'person' : 'people'}`
                : // An org with nobody attached isn't empty any more — a vendor
                  // you only ever phone is a complete record (0032).
                  org.phone || org.website || null,
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
