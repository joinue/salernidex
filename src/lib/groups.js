// Smart-group membership: a person matches when they have ALL of
// all_tags, at least ONE of any_tags (if any are listed), and NONE
// of none_tags.
export function personMatchesGroup(group, person) {
  const tags = person.tags || []
  const has = (t) => tags.includes(t)
  if ((group.all_tags || []).some((t) => !has(t))) return false
  if ((group.any_tags || []).length && !(group.any_tags || []).some(has)) return false
  if ((group.none_tags || []).some(has)) return false
  return true
}

export function groupMembers(group, people) {
  return people.filter((p) => !p.deleted_at && personMatchesGroup(group, p))
}

// Human-readable rule, e.g. "PACE customer AND UA · any of: A, B · not: C"
export function describeGroup(group) {
  const parts = []
  if ((group.all_tags || []).length) parts.push(group.all_tags.join(' AND '))
  if ((group.any_tags || []).length) parts.push(`any of: ${group.any_tags.join(', ')}`)
  if ((group.none_tags || []).length) parts.push(`not: ${group.none_tags.join(', ')}`)
  return parts.join(' · ') || 'No rules yet — matches everyone'
}
