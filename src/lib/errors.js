// Translate a raw Supabase/Postgres error into a short, human message for a
// toast. We match on SQLSTATE codes first (stable) and fall back to message
// text. Anything unrecognized passes through, so we never hide a real error.
export function friendlyError(err) {
  if (!err) return 'Something went wrong'
  const msg = err.message || String(err)
  const code = err.code

  if (code === '23505' || /duplicate key|already exists/i.test(msg)) return 'That already exists — looks like a duplicate.'
  if (code === '23502' || /null value in column/i.test(msg)) return 'A required field is missing.'
  if (code === '23514' || /violates check constraint/i.test(msg)) return "That value isn't allowed here."
  if (code === '23503' || /foreign key/i.test(msg)) return "That's linked to something that no longer exists."
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) return "You don't have access to save that."
  if (/failed to fetch|networkerror|network request failed|offline/i.test(msg)) return 'You appear to be offline — your change will retry.'

  return msg
}
