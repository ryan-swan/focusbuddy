import Dashboard from '../dashboard/Dashboard'

// Master dashboard — global scope. Same Dashboard component used by every Project
// Dashboard; only the scope differs.
export default function HomeDashboard(): JSX.Element {
  return <Dashboard scope={{ kind: 'global' }} title="Home" icon="dashboard" />
}
