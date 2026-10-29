import { useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { Headphones, LayoutDashboard, Ticket, UsersRound, Plus, ChevronDown, Menu, X, LogOut, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { Avatar, useToast } from '../components/ui';
export function Logo() { return <Link to="/dashboard" className="logo"><span className="logo-mark"><Headphones size={23} strokeWidth={2.3}/></span><span>Support<span className="logo-light">Desk</span><i/></span></Link>; }
export default function Shell() {
  const { user, logout } = useAuth(); const toast = useToast();
  const [open, setOpen] = useState(false); const location = useLocation();
  const title = location.pathname.startsWith('/users') ? 'People' : location.pathname.startsWith('/tickets') ? 'Tickets' : 'Overview';
  return <div className="app-layout"><a className="skip-link" href="#main">Skip to content</a>
    {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)}/>}
    <aside className={`sidebar ${open ? 'is-open' : ''}`}><div className="sidebar-brand"><Logo/><button className="icon-button mobile-only" aria-label="Close navigation" onClick={() => setOpen(false)}><X size={20}/></button></div>
      <div className="workspace-switch"><span className="workspace-icon">S</span><div><strong>Support workspace</strong><small>Customer success team</small></div><span className="workspace-dot" title="Workspace"/></div>
      <p className="nav-caption">Workspace</p><nav aria-label="Main navigation">
        <NavLink to="/dashboard" onClick={() => setOpen(false)}><LayoutDashboard size={19}/>Overview</NavLink>
        <NavLink to="/tickets" onClick={() => setOpen(false)}><Ticket size={19}/>Tickets</NavLink>
        {user.role === 'Admin' && <NavLink to="/users" onClick={() => setOpen(false)}><UsersRound size={19}/>People<span className="nav-mini">Admin</span></NavLink>}
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><span className="note-symbol"><Headphones size={21}/></span><strong>A good reply goes a long way.</strong><p>Keep the conversation moving. Every customer counts.</p><Link to="/tickets" onClick={() => setOpen(false)}>Go to your queue <ArrowUpRight size={15}/></Link></div>
      <div className="sidebar-identity"><Avatar name={user.name}/><div><strong>{user.name}</strong><small>{user.role} workspace</small></div><ShieldCheck size={16}/></div></div>
    </aside>
    <div className="app-body"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-only" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu size={21}/></button><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{title}</strong></div><div className="topbar-right"><span className="demo-label"><span/>Demo workspace</span><details className="profile-menu"><summary><Avatar name={user.name} size="small"/><span className="profile-name">{user.name.split(' ')[0]}</span><ChevronDown size={14}/></summary><div className="profile-panel"><strong>{user.name}</strong><small>{user.email}</small><span className="role-label">{user.role}</span><button onClick={async () => { try { await logout(); } catch (e) { toast(e.message); } }}><LogOut size={16}/>Sign out</button></div></details></div></header>
      <main id="main" className="main-content"><Outlet/></main><footer className="footer"><span>SupportDesk</span><span>Better conversations. Happier customers.</span></footer>
    </div></div>;
}
