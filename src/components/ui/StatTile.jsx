// A single figure with its caption, and the grid that lays them out.
//
// The grid auto-fits rather than fixing three columns: the habit detail page
// shows seven tiles, and a hard 3-up left the seventh stranded alone on its
// own row. `StatGrid` also keeps the last row from stretching oddly when the
// count isn't a multiple of the column count.
export function StatGrid({ children }) {
  return <div className="stat-grid">{children}</div>
}

export default function StatTile({ value, unit, label }) {
  return (
    <div className="stat-tile">
      <div className="stat-value">
        {value}
        {unit && <span className="stat-unit"> {unit}</span>}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
