// Invite codes are shared human-to-human (texted, read aloud, typed on a phone
// with auto-capitalization on), so matching them must be forgiving. We compare
// on a normalized form — uppercase, letters+digits only — so "a3f9-c20b",
// "A3F9C20B", and "a3f9 c20b" are all the same code. The DB's join_household()
// normalizes the SAME way; this is the client mirror for pre-send + display.
export function normalizeJoinCode(code) {
  return (code || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

// Pretty form for display/sharing: normalized, then grouped in 3s with hyphens
// (ABC-DEF, ABC-DEF-GH). Purely cosmetic — what's typed back is re-normalized.
export function formatJoinCode(code) {
  const n = normalizeJoinCode(code)
  return n.match(/.{1,3}/g)?.join('-') || n
}
