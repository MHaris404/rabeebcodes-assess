import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Info } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, PageHeading, useToast } from '../../components/ui';
export default function TicketForm({ ticket, onSaved, onCancel }) {
  const { user } = useAuth(); const cache = useQueryClient(), navigate = useNavigate(), toast = useToast();
  const key = useRef(crypto.randomUUID());
  const [draft, setDraft] = useState({ subject: ticket?.subject || '', description: ticket?.description || '', category: ticket?.category || 'General', priority: ticket?.priority || 'Medium' });
  const mutation = useMutation({ mutationFn: () => api(ticket ? `/tickets/${ticket.id}` : '/tickets', { method: ticket ? 'PATCH' : 'POST', body: { ...draft, ...(ticket ? { expectedVersion: ticket.version } : {}) }, idempotencyKey: ticket ? undefined : key.current }), onSuccess: async result => {
    await cache.invalidateQueries({ queryKey: [user.id] }); toast(ticket ? 'Ticket updated' : 'Ticket created');
    if (onSaved) onSaved(result.data); else navigate(`/tickets/${result.data.id}`);
  }, onError: error => { if (error.status === 409) cache.invalidateQueries({ queryKey: [user.id] }); } });
  function field(name, value) { setDraft(previous => ({ ...previous, [name]: value })); }
  return <>{!ticket && <><Link className="back-link" to="/tickets"><ArrowLeft size={16}/>Back to tickets</Link><PageHeading title="New ticket" description="Tell us what’s happening. We’ll take it from here."/></>}<form className={`ticket-form ${ticket ? '' : 'panel form-panel'}`} onSubmit={e => { e.preventDefault(); mutation.mutate(); }}>
    <ErrorBox error={mutation.error}/>
    <label>Subject<input name="subject" aria-label="Subject" aria-describedby="subject-help" placeholder="A short summary of what you need help with" required maxLength={200} value={draft.subject} onChange={e => field('subject', e.target.value)}/><small id="subject-help">Keep it specific so the right person can jump in.</small></label>
    <div className="form-row"><label>Category<select value={draft.category} onChange={e => field('category', e.target.value)}>{['Technical', 'Billing', 'General', 'Other'].map(v => <option key={v}>{v}</option>)}</select></label><label>Priority<select value={draft.priority} onChange={e => field('priority', e.target.value)}>{['Low', 'Medium', 'High', 'Urgent'].map(v => <option key={v}>{v}</option>)}</select></label></div>
    <label>Description<textarea name="description" aria-label="Description" aria-describedby="description-help" rows={7} required maxLength={10000} placeholder="Share the details, what you expected, and anything you’ve already tried…" value={draft.description} onChange={e => field('description', e.target.value)}/><small id="description-help">Include enough context to help us understand the issue. Please don’t share passwords.</small></label>
    {!ticket && <div className="form-note"><Info size={17}/><span>Your ticket starts as Open. You can follow updates and reply in the conversation.</span></div>}
    <div className="form-actions">{onCancel ? <button type="button" className="button secondary" onClick={onCancel}>Cancel</button> : <Link className="button secondary" to="/tickets">Cancel</Link>}<button className="button primary" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : ticket ? 'Save changes' : 'Create ticket'}<Send size={16}/></button></div>
  </form></>;
}
