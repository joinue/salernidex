// Group membership comes in two flavors:
//   manual — the group lists its members by id (member_ids); deliberate, curated
//   smart  — a person matches when they have ALL of all_tags, at least ONE of
//            any_tags (if any are listed), and NONE of none_tags
// `kind` is missing on legacy rows, which are all smart, so absence ⇒ smart.
export function personMatchesGroup(group, person) {
  if (group.kind === 'manual') {
    return (group.member_ids || []).includes(person.id)
  }
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
// the caller — they must be removed, not added.) Manual and rules-less groups
// return [] — no tag joins you, so they don't appear as "joinable" in a person's
// tag list (manual membership is edited on the group itself).
export function groupJoinTags(group) {
  if (group.kind === 'manual') return []
  const add = [...(group.all_tags || [])]
  if ((group.any_tags || []).length) add.push(group.any_tags[0])
  return add
}

// Human-readable membership summary: the tag rule for smart groups, or
// "Hand-picked" for manual ones (the member count is shown alongside it).
export function describeGroup(group) {
  if (group.kind === 'manual') return 'Hand-picked'
  const parts = []
  if ((group.all_tags || []).length) parts.push(group.all_tags.join(' AND '))
  if ((group.any_tags || []).length) parts.push(`any of: ${group.any_tags.join(', ')}`)
  if ((group.none_tags || []).length) parts.push(`not: ${group.none_tags.join(', ')}`)
  return parts.join(' · ') || 'No rules yet — matches everyone'
}
