import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Info } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, PageHeading, useToast } from '../../components/ui';
const fields = ['subject', 'description', 'category', 'priority'];
export default function TicketForm({ ticket, onSaved, onCancel }) {
  const { user } = useAuth(); const cache = useQueryClient(), navigate = useNavigate(), toast = useToast();
  const attempt = useRef(null);
  const [base, setBase] = useState(ticket);
  const [draft, setDraft] = useState({ subject: ticket?.subject || '', description: ticket?.description || '', category: ticket?.category || 'General', priority: ticket?.priority || 'Medium' });
  const dirty = ticket ? Object.fromEntries(fields.filter(key => draft[key] !== base[key]).map(key => [key, draft[key]])) : draft;
  const mutation = useMutation({ mutationFn: () => {
    if (ticket) return api(`/tickets/${ticket.id}`, { method: 'PATCH', body: { ...dirty, expectedVersion: base.version } });
    attempt.current ||= { key: crypto.randomUUID(), payload: structuredClone(draft) };
    return api('/tickets', { method: 'POST', body: attempt.current.payload, idempotencyKey: attempt.current.key });
  }, onSuccess: async result => {
    attempt.current = null;
    await cache.invalidateQueries({ queryKey: [user.id] }); toast(ticket ? 'Ticket updated' : 'Ticket created');
    if (onSaved) onSaved(result.data); else navigate(`/tickets/${result.data.id}`);
  }, onError: error => {
    if (!ticket && error.status >= 400 && error.status < 500 && error.status !== 409) attempt.current = null;
    if (error.status === 409) cache.invalidateQueries({ queryKey: [user.id] });
  } });
  const unresolved = !ticket && mutation.isError && Boolean(attempt.current);
  const conflict = mutation.error?.code === 'STALE_TICKET';
  function field(name, value) { setDraft(previous => ({ ...previous, [name]: value })); }
  function reconcile() {
    setDraft({ ...Object.fromEntries(fields.map(key => [key, ticket[key]])), ...dirty });
    setBase(ticket); mutation.reset();
  }
  return <>{!ticket && <><Link className="back-link" to="/tickets"><ArrowLeft size={16}/>Back to tickets</Link><PageHeading title="New ticket" description="Tell us what’s happening. We’ll take it from here."/></>}<form className={`ticket-form ${ticket ? '' : 'panel form-panel'}`} onSubmit={e => { e.preventDefault(); mutation.mutate(); }}>
    <ErrorBox error={mutation.error}/>
    {unresolved && <p className="form-note">Delivery is unconfirmed. Retry sends the original ticket with the same key, so it can be recovered without creating a duplicate.</p>}
    {conflict && <div className="conflict-review"><strong>Review the latest version before saving</strong><p>Your edits are preserved. Compare them with the current values below.</p>{Object.keys(dirty).map(key => <div key={key}><span>{key}</span><p><b>Current:</b> {ticket[key]}</p><p><b>Your edit:</b> {draft[key]}</p></div>)}<button type="button" className="button secondary" disabled={ticket.version === base.version} onClick={reconcile}>Keep my edits on latest version</button><small>Unedited fields will use the latest values. Save again after reviewing.</small></div>}
    <fieldset className="form-fields" disabled={mutation.isPending || unresolved}>
      <label>Subject<input name="subject" aria-label="Subject" aria-describedby="subject-help" placeholder="A short summary of what you need help with" required maxLength={200} value={draft.subject} onChange={e => field('subject', e.target.value)}/><small id="subject-help">Keep it specific so the right person can jump in.</small></label>
      <div className="form-row"><label>Category<select value={draft.category} onChange={e => field('category', e.target.value)}>{['Technical', 'Billing', 'General', 'Other'].map(v => <option key={v}>{v}</option>)}</select></label><label>Priority<select value={draft.priority} onChange={e => field('priority', e.target.value)}>{['Low', 'Medium', 'High', 'Urgent'].map(v => <option key={v}>{v}</option>)}</select></label></div>
      <label>Description<textarea name="description" aria-label="Description" aria-describedby="description-help" rows={7} required maxLength={10000} placeholder="Share the details, what you expected, and anything you’ve already tried…" value={draft.description} onChange={e => field('description', e.target.value)}/><small id="description-help">Include enough context to help us understand the issue. Please don’t share passwords.</small></label>
    </fieldset>
    {!ticket && <div className="form-note"><Info size={17}/><span>Your ticket starts as Open. You can follow updates and reply in the conversation.</span></div>}
    <div className="form-actions">{onCancel ? <button type="button" className="button secondary" onClick={onCancel}>Cancel</button> : <Link className="button secondary" to="/tickets">Cancel</Link>}<button className="button primary" disabled={mutation.isPending || conflict || (ticket && !Object.keys(dirty).length)}>{mutation.isPending ? 'Saving…' : ticket ? 'Save changes' : unresolved ? 'Retry ticket' : 'Create ticket'}<Send size={16}/></button></div>
  </form></>;
}
