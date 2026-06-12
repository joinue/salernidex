export const PRIVACY_LABELS = {
  marc_only: 'Marc only',
  shared: 'Shared',
  family_shared: 'Family shared',
  public: 'Public',
}

// Format a YYYY-MM-DD date string without timezone surprises
export function formatDate(dateString) {
  if (!dateString) return null
  const [y, m, d] = dateString.split('-').map(Number)
  if (!y || !m || !d) return dateString
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
