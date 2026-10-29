import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, X, LoaderCircle, Inbox, ArrowUpRight } from 'lucide-react';
const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 5500); return () => clearTimeout(timer); }, [toast]);
  return <ToastContext.Provider value={message => setToast({ message, id: Date.now() })}>{children}{toast && <div className="toast" role="status"><span className="toast-dot"/>{toast.message}<button aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={16}/></button></div>}</ToastContext.Provider>;
}
export const useToast = () => useContext(ToastContext);
export function Avatar({ name = '?', size = '', color = '' }) { return <span aria-hidden="true" className={`avatar ${size} ${color}`}>{name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span>; }
export function Badge({ value }) { return <span className={`badge badge-${value?.toLowerCase().replaceAll(' ', '-')}`}><span/>{value}</span>; }
export function Loading({ text = 'Loading your workspace…' }) { return <div className="loading" role="status"><LoaderCircle className="spin" size={22}/><span>{text}</span></div>; }
export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return <div className="error-box" role="alert"><AlertCircle size={18}/><div><strong>{error.message}</strong>{error.fieldErrors && <ul>{Object.entries(error.fieldErrors).flatMap(([field, messages]) => messages.map(m => <li key={`${field}-${m}`}>{field}: {m}</li>))}</ul>}{error.requestId && <small>Reference: {error.requestId}</small>}{onRetry && <button className="text-link" onClick={onRetry}>Try again</button>}</div></div>;
}
export function Empty({ title = 'No tickets here yet', description = 'Create a ticket to start a conversation.', action }) { return <div className="empty"><span className="empty-icon"><Inbox size={26}/></span><h3>{title}</h3><p>{description}</p>{action}</div>; }
export function PageHeading({ title, description, action }) { return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
export function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => { if (dialog.open) dialog.close(); }; }, []);
  return <dialog ref={ref} className="modal" onCancel={onClose} onClick={e => { if (e.target === ref.current) onClose(); }} aria-labelledby="modal-title"><div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}</dialog>;
}
export const initials = name => name?.split(' ').map(n => n[0]).slice(0, 2).join('');
export function relative(date) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (minutes < 1) return 'Just now'; if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`; return `${Math.floor(minutes / 1440)}d ago`;
}
export const dateLabel = date => new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
export function ActivityText({ activity }) {
  const labels = { 'ticket.created': 'created a ticket', 'ticket.assigned': activity.metadata?.assignedAgentId ? 'assigned the ticket' : 'unassigned the ticket', 'ticket.status_changed': `changed status to ${activity.metadata?.to === 'InProgress' ? 'In Progress' : activity.metadata?.to}`, 'ticket.updated': 'updated ticket details', 'message.created': 'added a reply' };
  return <><strong>{activity.actor?.name || 'A team member'}</strong> {labels[activity.action] || 'updated the ticket'}</>;
}
