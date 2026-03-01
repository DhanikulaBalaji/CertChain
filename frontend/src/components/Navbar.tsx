import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../services/AuthContext';
import NotificationCenter from './NotificationCenter';

const NAV_LINKS: Record<string, Array<{ to: string; label: string; icon: string }>> = {
  user: [
    { to: '/dashboard',            label: 'Dashboard',    icon: 'fa-grid-2' },
    { to: '/wallet',               label: 'Wallet',       icon: 'fa-wallet' },
    { to: '/my-certificates',      label: 'Certificates', icon: 'fa-graduation-cap' },
    { to: '/validate-certificate', label: 'Verify',       icon: 'fa-shield-check' },
  ],
  admin: [
    { to: '/dashboard',            label: 'Dashboard',    icon: 'fa-grid-2' },
    { to: '/validate-certificate', label: 'Verify',       icon: 'fa-shield-check' },
  ],
  super_admin: [
    { to: '/dashboard',            label: 'Dashboard',    icon: 'fa-grid-2' },
    { to: '/validate-certificate', label: 'Verify',       icon: 'fa-shield-check' },
  ],
};

const ROLE_STYLE: Record<string, { bg: string; color: string; border: string; icon: string }> = {
  super_admin: { bg: 'rgba(167,139,250,0.15)', color: '#c4b5fd', border: 'rgba(167,139,250,0.35)', icon: 'fa-crown' },
  admin:       { bg: 'rgba(245,158,11,0.15)',  color: '#fbbf24', border: 'rgba(245,158,11,0.35)',  icon: 'fa-shield-halved' },
  user:        { bg: 'rgba(99,102,241,0.15)',  color: '#a5b4fc', border: 'rgba(99,102,241,0.35)',  icon: 'fa-user-graduate' },
};

const NavigationBar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen]           = useState(false);
  const [dropdownOpen, setDropdownOpen]       = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount]         = useState(0);
  const [bellAnim, setBellAnim]               = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMobileOpen(false); setDropdownOpen(false); }, [location]);

  useEffect(() => {
    if (!user) return;
    fetchUnread();
    const id = setInterval(fetchUnread, 120_000);
    return () => clearInterval(id);
  }, [user]); // eslint-disable-line

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchUnread = async () => {
    try {
      const res = await api.get('/notifications/unread-count');
      const n = res.data?.unread_count || 0;
      if (n > unreadCount) { setBellAnim(true); setTimeout(() => setBellAnim(false), 800); }
      setUnreadCount(n);
    } catch { setUnreadCount(0); }
  };

  const handleLogout = () => { logout(); navigate('/login'); };
  const links = user ? (NAV_LINKS[user.role] || NAV_LINKS.user) : [];
  const roleStyle = user ? (ROLE_STYLE[user.role] || ROLE_STYLE.user) : null;
  const initials = user?.full_name?.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        height: 64,
        background: 'rgba(8,6,26,0.92)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(99,102,241,0.15)',
        boxShadow: '0 4px 32px rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{
          maxWidth: 1280, margin: '0 auto', padding: '0 24px',
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* ── Brand ── */}
          <Link to="/" style={{ display:'flex', alignItems:'center', gap: 10, textDecoration:'none', flexShrink:0 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'linear-gradient(135deg,#6366f1,#a78bfa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(99,102,241,0.45)',
            }}>
              <i className="fas fa-certificate" style={{ color: '#fff', fontSize: '0.85rem' }} />
            </div>
            <span style={{
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem',
              color: 'var(--c-text)', letterSpacing: '-0.02em',
            }}>
              Cert<span style={{ color: 'var(--c-indigo-lt)' }}>Chain</span>
            </span>
          </Link>

          {/* ── Desktop nav links ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} className="d-none d-md-flex">
            {links.map(({ to, label, icon }) => {
              const isActive = location.pathname === to || location.pathname.startsWith(to + '/');
              return (
                <Link
                  key={to} to={to}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '7px 14px', borderRadius: 10,
                    fontSize: '0.875rem', fontWeight: 600,
                    textDecoration: 'none', transition: 'all 0.2s',
                    background: isActive ? 'rgba(99,102,241,0.18)' : 'transparent',
                    color: isActive ? '#a5b4fc' : 'var(--c-text-2)',
                    border: isActive ? '1px solid rgba(99,102,241,0.35)' : '1px solid transparent',
                  }}
                >
                  <i className={`fas ${icon}`} style={{ fontSize: '0.8rem' }} />
                  {label}
                </Link>
              );
            })}
          </div>

          {/* ── Right side ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {user ? (
              <>
                {/* Bell */}
                <button
                  onClick={() => setShowNotifications(true)}
                  style={{
                    position: 'relative', padding: '8px 10px', borderRadius: 10, border: 'none',
                    background: 'rgba(255,255,255,0.05)', color: 'var(--c-text-2)',
                    cursor: 'pointer', fontSize: '1rem', transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,0.09)')}
                  onMouseLeave={e => (e.currentTarget.style.background='rgba(255,255,255,0.05)')}
                >
                  <i className={`fas fa-bell ${bellAnim ? 'fa-shake' : ''}`} />
                  {unreadCount > 0 && (
                    <span style={{
                      position: 'absolute', top: 4, right: 4,
                      minWidth: 16, height: 16, borderRadius: 8,
                      background: '#ef4444', color: '#fff',
                      fontSize: '0.65rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 3px',
                    }}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* User dropdown */}
                <div ref={dropRef} style={{ position: 'relative' }}>
                  <button
                    onClick={() => setDropdownOpen(v => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9,
                      padding: '5px 10px 5px 5px', borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer',
                      background: dropdownOpen ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
                      transition: 'all 0.2s',
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: 'linear-gradient(135deg,#6366f1,#a78bfa)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: '0.7rem', fontWeight: 800,
                      flexShrink: 0,
                    }}>
                      {initials}
                    </div>
                    <div style={{ textAlign: 'left' }} className="d-none d-sm-block">
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--c-text)', lineHeight: 1.2 }}>
                        {user.full_name?.split(' ')[0]}
                      </div>
                      {roleStyle && (
                        <span style={{
                          fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px',
                          borderRadius: 4, background: roleStyle.bg,
                          color: roleStyle.color, border: `1px solid ${roleStyle.border}`,
                          display: 'flex', alignItems: 'center', gap: 3, width:'fit-content',
                        }}>
                          <i className={`fas ${roleStyle.icon}`} style={{ fontSize: '0.55rem' }} />
                          {user.role.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    <i className="fas fa-chevron-down" style={{
                      fontSize: '0.65rem', color: 'var(--c-text-3)',
                      transform: dropdownOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s',
                    }} />
                  </button>

                  <AnimatePresence>
                    {dropdownOpen && (
                      <motion.div
                        initial={{ opacity:0, y: 8, scale: 0.96 }}
                        animate={{ opacity:1, y: 0, scale: 1 }}
                        exit={{ opacity:0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        style={{
                          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                          width: 220, borderRadius: 16,
                          background: 'rgba(10,8,28,0.99)',
                          border: '1px solid rgba(99,102,241,0.2)',
                          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                          overflow: 'hidden', zIndex: 100,
                        }}
                      >
                        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--c-text)', marginBottom: 2 }}>{user.full_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--c-text-3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.email}</div>
                        </div>
                        {[
                          { to: '/profile',         label: 'Profile',            icon: 'fa-user',           roles: ['user','admin','super_admin'] },
                          { to: '/wallet',           label: 'Certificate Wallet', icon: 'fa-wallet',          roles: ['user'] },
                          { to: '/my-certificates',  label: 'My Certificates',   icon: 'fa-graduation-cap',  roles: ['user'] },
                        ].filter(item => item.roles.includes(user.role)).map(({ to, label, icon }) => (
                          <Link
                            key={to} to={to}
                            onClick={() => setDropdownOpen(false)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '11px 16px', textDecoration: 'none',
                              color: 'var(--c-text-2)', fontSize: '0.875rem', fontWeight: 500,
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background='rgba(99,102,241,0.08)'; (e.currentTarget as HTMLElement).style.color='var(--c-text)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background='transparent'; (e.currentTarget as HTMLElement).style.color='var(--c-text-2)'; }}
                          >
                            <i className={`fas ${icon}`} style={{ width: 16, textAlign: 'center', color: 'var(--c-indigo-lt)', fontSize: '0.8rem' }} />
                            {label}
                          </Link>
                        ))}
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4 }} />
                        <button
                          onClick={handleLogout}
                          style={{
                            width: '100%', textAlign: 'left', padding: '11px 16px',
                            display: 'flex', alignItems: 'center', gap: 10,
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#f87171', fontSize: '0.875rem', fontWeight: 500,
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background='rgba(239,68,68,0.1)')}
                          onMouseLeave={e => (e.currentTarget.style.background='none')}
                        >
                          <i className="fas fa-right-from-bracket" style={{ width: 16, textAlign: 'center', fontSize: '0.8rem' }} />
                          Sign Out
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Link to="/login" style={{
                  padding: '8px 16px', borderRadius: 10, textDecoration: 'none',
                  color: 'var(--c-text-2)', fontSize: '0.875rem', fontWeight: 600,
                  transition: 'all 0.2s', border: '1px solid transparent',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color='var(--c-text)'; (e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.05)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color='var(--c-text-2)'; (e.currentTarget as HTMLElement).style.background='transparent'; }}
                >
                  Sign In
                </Link>
                <Link to="/register" style={{
                  padding: '8px 18px', borderRadius: 10, textDecoration: 'none',
                  background: 'linear-gradient(135deg,#6366f1,#818cf8)',
                  color: '#fff', fontSize: '0.875rem', fontWeight: 700,
                  boxShadow: '0 4px 16px rgba(99,102,241,0.4)',
                  transition: 'all 0.2s',
                }}>
                  Get Started
                </Link>
              </div>
            )}

            {/* Mobile burger */}
            <button
              className="d-md-none"
              onClick={() => setMobileOpen(v => !v)}
              style={{
                padding: '8px 10px', borderRadius: 10, border: 'none',
                background: 'rgba(255,255,255,0.05)', color: 'var(--c-text-2)',
                cursor: 'pointer', fontSize: '1rem',
              }}
            >
              <i className={`fas ${mobileOpen ? 'fa-xmark' : 'fa-bars'}`} />
            </button>
          </div>
        </div>

        {/* ── Mobile menu ── */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity:0, height:0 }}
              animate={{ opacity:1, height:'auto' }}
              exit={{ opacity:0, height:0 }}
              style={{
                position: 'absolute', top: 64, left: 0, right: 0,
                background: 'rgba(8,6,26,0.99)', borderBottom: '1px solid rgba(99,102,241,0.15)',
                overflow: 'hidden', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4,
              }}
            >
              {links.map(({ to, label, icon }) => {
                const isActive = location.pathname === to;
                return (
                  <Link key={to} to={to} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '11px 14px', borderRadius: 10, textDecoration: 'none',
                    background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color: isActive ? '#a5b4fc' : 'var(--c-text-2)',
                    fontSize: '0.9rem', fontWeight: 600,
                  }}>
                    <i className={`fas ${icon}`} style={{ width: 18, textAlign:'center', fontSize:'0.85rem' }} />
                    {label}
                  </Link>
                );
              })}
              {user && (
                <button onClick={handleLogout} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 14px', borderRadius: 10, border: 'none',
                  background: 'transparent', color: '#f87171', fontSize: '0.9rem', fontWeight: 600,
                  cursor: 'pointer', marginTop: 4, textAlign: 'left',
                }}>
                  <i className="fas fa-right-from-bracket" style={{ width: 18, textAlign:'center' }} />
                  Sign Out
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Spacer */}
      <div style={{ height: 64 }} />

      {user && (
        <NotificationCenter
          show={showNotifications}
          onHide={() => setShowNotifications(false)}
          onNotificationUpdate={fetchUnread}
        />
      )}
    </>
  );
};

export default NavigationBar;
