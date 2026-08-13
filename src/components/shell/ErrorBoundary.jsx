import { Component } from 'react'
import Wordmark from '../ui/Wordmark'

// A render crash should never strand anyone on a blank white page —
// especially on a phone with no devtools. Show a friendly reset.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="login-wrap">
        <div className="login-box" style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <Wordmark height={34} />
          </div>
          <h1 style={{ marginBottom: 8 }}>Something broke</h1>
          <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
            Sorry about that. Reloading usually clears it — your data is safe.
          </p>
          <button
            className="btn-primary"
            onClick={() => {
              window.location.hash = '/'
              window.location.reload()
            }}
          >
            Reload
          </button>
          <p className="muted mono" style={{ fontSize: 11, marginTop: 18, wordBreak: 'break-all' }}>
            {String(this.state.error?.message || this.state.error)}
          </p>
        </div>
      </div>
    )
  }
}
