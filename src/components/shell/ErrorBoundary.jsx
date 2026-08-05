import { Component } from 'react'

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
          <img
            src="/logo-mark.png"
            width="44"
            height="44"
            alt=""
            style={{ borderRadius: 10, marginBottom: 14 }}
          />
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
