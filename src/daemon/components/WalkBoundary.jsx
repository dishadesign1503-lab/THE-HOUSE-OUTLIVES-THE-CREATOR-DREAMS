import { Component } from 'react'

// If the 3D house fails (for example, no WebGL in this browser), show a way back instead of
// taking the whole app down. The plan, coins and daemon are untouched.
export default class WalkBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="walk walk-loading">
        <div className="walk-porch">
          <p>The house could not be built in 3D here.</p>
          <span className="dim">{String(this.state.error.message ?? this.state.error)}</span>
          <button className="btn primary" onClick={this.props.onExit}>
            Return to floor plan
          </button>
        </div>
      </div>
    )
  }
}
