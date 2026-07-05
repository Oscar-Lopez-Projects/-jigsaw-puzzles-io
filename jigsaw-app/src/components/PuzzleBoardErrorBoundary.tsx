import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onReset: () => void;
}

interface State {
  error: Error | null;
}

export default class PuzzleBoardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[PuzzleBoard error]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: '32px',
          color: '#f87171',
          background: '#1c192c',
          borderRadius: '12px',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
            Something went wrong rendering the puzzle.
          </p>
          <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 24 }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset();
            }}
            style={{
              padding: '10px 24px',
              background: '#7c3aed',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Back to Setup
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
