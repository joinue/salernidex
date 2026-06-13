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

// The tags to ADD to a person so they match this group: every required AND tag,
// plus one OR tag if the rule has an "any of" clause. (none_tags are handled by
// the caller — they must be removed, not added.) A rules-less group returns [].
export function groupJoinTags(group) {
  const add = [...(group.all_tags || [])]
  if ((group.any_tags || []).length) add.push(group.any_tags[0])
  return add
}

// Human-readable rule, e.g. "client AND active · any of: A, B · not: C"
export function describeGroup(group) {
  const parts = []
  if ((group.all_tags || []).length) parts.push(group.all_tags.join(' AND '))
  if ((group.any_tags || []).length) parts.push(`any of: ${group.any_tags.join(', ')}`)
  if ((group.none_tags || []).length) parts.push(`not: ${group.none_tags.join(', ')}`)
  return parts.join(' · ') || 'No rules yet — matches everyone'
}
