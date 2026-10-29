import { Component, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, Link } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/query-client';
import { AuthProvider, useAuth } from '../features/auth/AuthContext';
import { ToastProvider, Loading, ErrorBox, Empty } from '../components/ui';
import Shell from './Shell';
import AuthPage from '../features/auth/AuthPage';
const Dashboard = lazy(() => import('../features/dashboard/Dashboard'));
import TicketList from '../features/tickets/TicketList';
import TicketForm from '../features/tickets/TicketForm';
import TicketDetail from '../features/tickets/TicketDetail';
import Users from '../features/users/Users';
function Protected({ admin = false }) {
  const auth = useAuth();
  if (auth.loading) return <Loading/>;
  if (auth.error) return <div className="standalone-error"><ErrorBox error={auth.error} onRetry={auth.retry}/></div>;
  if (!auth.user) return <Navigate to="/login" replace/>;
  if (admin && auth.user.role !== 'Admin') return <Navigate to="/dashboard" replace/>;
  return <Outlet/>;
}
class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="standalone-error"><h1>Something interrupted your workspace.</h1><p>Your saved conversations are safe. Reload to try again.</p><button className="button primary" onClick={() => window.location.reload()}>Reload workspace</button></div> : this.props.children; }
}
export default function App() {
  return <ErrorBoundary><QueryClientProvider client={queryClient}><AuthProvider><ToastProvider><BrowserRouter><Routes>
    <Route path="/login" element={<AuthPage/>}/><Route path="/register" element={<AuthPage register/>}/>
    <Route element={<Protected/>}><Route element={<Shell/>}>
      <Route index element={<Navigate to="/dashboard" replace/>}/><Route path="/dashboard" element={<Suspense fallback={<Loading/>}><Dashboard/></Suspense>}/>
      <Route path="/tickets" element={<TicketList/>}/><Route path="/tickets/new" element={<TicketForm/>}/><Route path="/tickets/:id" element={<TicketDetail/>}/>
      <Route element={<Protected admin/>}><Route path="/users" element={<Users/>}/></Route>
      <Route path="*" element={<Empty title="This page isn’t here" description="Head back to your workspace to keep going." action={<Link to="/dashboard" className="button primary">Go to overview</Link>}/>}/>
    </Route></Route></Routes></BrowserRouter></ToastProvider></AuthProvider></QueryClientProvider></ErrorBoundary>;
}
