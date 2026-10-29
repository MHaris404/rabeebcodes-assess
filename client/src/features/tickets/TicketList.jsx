import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, SlidersHorizontal, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../auth/AuthContext';
import { PageHeading, ErrorBox, Loading } from '../../components/ui';
import TicketTable from './TicketTable';
export default function TicketList() {
  const { user } = useAuth(); const [params, setParams] = useSearchParams();
  const query = new URLSearchParams(params); query.set('pageSize', '10');
  const result = useQuery({ queryKey: [user.id, 'tickets', query.toString()], queryFn: ({ signal }) => api(`/tickets?${query}`, { signal }) });
  const agents = useQuery({ queryKey: [user.id, 'agents'], enabled: user.role === 'Admin', queryFn: ({ signal }) => api('/users?role=Agent&pageSize=100', { signal }) });
  function change(key, value) { setParams(previous => { const next = new URLSearchParams(previous); value ? next.set(key, value) : next.delete(key); if (key !== 'page') next.delete('page'); return next; }); }
  const page = result.data?.pagination;
  return <><PageHeading title="Tickets" description="A shared space for every question, issue, and conversation." action={<Link className="button primary" to="/tickets/new"><Plus size={17}/>New ticket</Link>}/>
    <div className="tickets-tabs"><button className={!params.get('status') ? 'active' : ''} onClick={() => change('status', '')}>All tickets</button>{['Open', 'In Progress', 'Resolved', 'Closed'].map(status => <button key={status} className={params.get('status') === status ? 'active' : ''} onClick={() => change('status', status)}>{status}</button>)}</div>
    <section className="panel"><div className="ticket-filters"><div className="search-field"><Search size={17}/><input aria-label="Search tickets" placeholder="Search by subject or ticket ID…" value={params.get('search') || ''} onChange={e => change('search', e.target.value)}/></div><div className="filter-select"><SlidersHorizontal size={16}/><select aria-label="Filter by priority" value={params.get('priority') || ''} onChange={e => change('priority', e.target.value)}><option value="">All priorities</option>{['Low', 'Medium', 'High', 'Urgent'].map(v => <option key={v}>{v}</option>)}</select></div>{user.role === 'Admin' && <select className="assignee-filter" aria-label="Filter by assignee" value={params.get('assigneeId') || ''} onChange={e => change('assigneeId', e.target.value)}><option value="">All assignees</option><option value="unassigned">Unassigned</option>{agents.data?.data.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}{params.size > 0 && <button className="text-link" onClick={() => setParams({})}><X size={14}/>Clear</button>}</div>
      {result.isPending ? <Loading text="Finding your tickets…"/> : result.isError ? <ErrorBox error={result.error} onRetry={result.refetch}/> : <TicketTable tickets={result.data.data}/>}
      {page && <div className="pagination"><span>{page.total ? `${(page.page - 1) * page.pageSize + 1}–${Math.min(page.page * page.pageSize, page.total)} of ${page.total} tickets` : '0 tickets'}</span><div><button className="button secondary small" disabled={page.page <= 1} onClick={() => change('page', String(page.page - 1))}><ChevronLeft size={15}/>Previous</button><button className="button secondary small" disabled={page.page >= page.totalPages} onClick={() => change('page', String(page.page + 1))}>Next<ChevronRight size={15}/></button></div></div>}
    </section></>;
}
