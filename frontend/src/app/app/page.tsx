"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/AuthContext';
import { Settings, LogOut } from 'lucide-react';
import { ConversationList } from '@/components/ConversationList';
import { MessagePane } from '@/components/MessagePane';
import { SettingsModal } from '@/components/SettingsModal';
import { ShortcutsModal } from '@/components/ShortcutsModal';

export default function AppHome() {
  const { user, logout } = useAuth();
  const [selectedConversation, setSelectedConversation] = useState<any | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // On desktop, always show sidebar. On mobile it's togglable.
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;

  const handleSelect = (conv: any) => {
    setSelectedConversation(conv);
    setShowSidebar(false); // Close on mobile after selecting
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') e.target.blur();
        return;
      }

      if (e.key === 'Escape') {
        setSelectedConversation(null);
        setShowSettings(false);
        setShowShortcuts(false);
      } else if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowShortcuts(v => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="app-container" style={{ position: 'relative', background: 'var(--bg-primary)' }}>

      {/* Mobile overlay backdrop */}
      {showSidebar && (
        <div
          onClick={() => setShowSidebar(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'none' }}
          className="mobile-backdrop"
        />
      )}

      {/* Sidebar */}
      <div className={`sidebar ${showSidebar ? 'open' : ''}`} style={{ flexShrink: 0 }}>
        <ConversationList
          onSelect={handleSelect}
          selectedId={selectedConversation?.id}
        />
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

        {/* Mobile top bar */}
        <div style={{ display: 'none' }} className="mobile-topbar">
          <button onClick={() => setShowSidebar(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '0.75rem', fontSize: '1.2rem' }}>
            ☰
          </button>
        </div>

        <MessagePane
          conversation={selectedConversation}
          key={selectedConversation?.id}
        />
      </div>

      {/* Bottom-left user badge */}
      <div style={{ position: 'absolute', bottom: '1rem', left: '1rem', zIndex: 100 }}>
        <div 
          onClick={() => setShowSettings(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            backgroundColor: 'var(--glass-bg)', backdropFilter: 'blur(16px)',
            border: '1px solid var(--glass-border)',
            padding: '0.35rem 0.6rem 0.35rem 0.4rem',
            borderRadius: 'var(--radius-full)',
            boxShadow: 'var(--shadow-xs)',
            fontSize: '0.8rem',
            cursor: 'pointer'
        }}>
          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-primary), #6B7FFF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>
            {user?.display_name?.charAt(0).toUpperCase() || '?'}
          </div>
          <span style={{ color: 'var(--text-secondary)', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.display_name}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setShowSettings(true); }}
            title="Settings"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.1rem 0.2rem', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <Settings size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); logout(); }}
            title="Sign out"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.1rem 0.2rem', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-danger)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
