import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Headphones, ArrowUpRight, MessageSquare, Check, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthContext';
import { ErrorBox } from '../../components/ui';
export default function AuthPage({ register = false }) {
  const auth = useAuth(); const [pending, setPending] = useState(false), [error, setError] = useState(null);
  if (auth.user) return <Navigate to="/dashboard" replace/>;
  async function submit(e) {
    e.preventDefault(); setPending(true); setError(null);
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try { await (register ? auth.register(body) : auth.login(body)); } catch (err) { setError(err); } finally { setPending(false); }
  }
  return <div className="auth-layout"><section className="auth-story"><div className="logo auth-logo"><span className="logo-mark"><Headphones size={24}/></span><span>SupportDesk<i/></span></div><div className="auth-story-copy"><span className="auth-story-icon"><MessageSquare size={30}/></span><h1>Great support starts<br/>with a conversation.</h1><p>One shared space to listen, solve problems, and make someone's day a little better.</p><div className="auth-preview"><div className="auth-preview-line"><span className="avatar">TB</span><div><strong>Taylor Brooks</strong><small>Thanks, that worked perfectly!</small></div><span className="auth-check"><Check size={18}/></span></div><div className="auth-preview-footer"><span className="badge badge-resolved"><span/>Resolved</span><span>Another happy customer</span></div></div></div><div className="auth-story-footer">A little more human. A lot more helpful.</div></section>
    <main className="auth-main"><div className="auth-form-wrap"><div className="auth-mobile-brand"><Headphones size={22}/>SupportDesk</div><span className="welcome-mark">{register ? 'Let’s get started' : 'Your workspace awaits'}</span><h1>{register ? 'Create your account' : 'Welcome back'}</h1><p>{register ? 'Tell us a little about yourself. We’re here to help.' : 'Sign in to keep good conversations going.'}</p><ErrorBox error={error}/><form onSubmit={submit} className="auth-form">
      {register && <label>Full name<input name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="Taylor Brooks"/></label>}
      <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@company.com"/></label>
      <label>Password<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 12 : 8} maxLength={register ? 72 : 128} placeholder={register ? 'At least 12 characters' : 'Enter your password'}/></label>
      {register && <small className="muted">Your account will be created as a Customer.</small>}
      <button className="button primary auth-submit" disabled={pending}>{pending ? 'Please wait…' : register ? 'Create account' : 'Sign in'}<ArrowUpRight size={17}/></button>
    </form><p className="auth-switch">{register ? 'Already have an account?' : 'New to SupportDesk?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></p>
    {!register && <div className="demo-access"><div><ShieldCheck size={17}/><strong>Explore the demo</strong></div><p>Choose an account, then enter the demo password from the README.</p><div className="demo-buttons">{[['Admin','admin'],['Agent','agent'],['Customer','customer']].map(([role, email]) => <button key={role} onClick={() => { const field = document.querySelector('input[name=email]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(field, `${email}@supportdesk.demo`); field.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('input[name=password]').focus(); }}>{role}</button>)}</div></div>}
    <div className="auth-legal"><ShieldCheck size={14}/>Your conversations stay in the right hands.</div></div></main></div>;
}
