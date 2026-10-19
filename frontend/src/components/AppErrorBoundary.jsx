import { Component } from 'react';
import { Link } from 'react-router-dom';

/** Catches render errors so one broken page never blanks the whole app. Shows no stack trace. */
export default class AppErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-md space-y-3 p-8">
        <h1 className="text-xl font-semibold">This page could not be shown</h1>
        <p className="text-sm text-slate-700">Please reload. If it keeps happening, contact support.</p>
        <Link className="text-indigo-700 underline" to="/app">Back to dashboard</Link>
      </div>
    );
  }
}
