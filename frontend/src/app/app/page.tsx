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
    <div className="app-container" style={{ position: 'relative' }}>
      <div className="desktop-app-layout">
        {/* Sidebar */}
        <div className={`sidebar ${selectedConversation ? 'mobile-hidden' : ''}`}>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <ConversationList
              onSelect={handleSelect}
              selectedId={selectedConversation?.id}
            />
          </div>
          {/* User Badge in sidebar */}
          <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
            <div 
              onClick={() => setShowSettings(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                padding: '0.4rem 0.6rem 0.4rem 0.4rem',
                borderRadius: 'var(--radius-full)',
                boxShadow: 'var(--shadow-xs)',
                fontSize: '0.8rem',
                cursor: 'pointer'
            }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-primary), #6B7FFF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
                {user?.display_name?.charAt(0).toUpperCase() || '?'}
              </div>
              <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.display_name}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); setShowSettings(true); }}
                title="Settings"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                <Settings size={16} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); logout(); }}
                title="Sign out"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-danger)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className={`message-pane-container ${selectedConversation ? 'mobile-active' : ''}`}>
          <MessagePane
            conversation={selectedConversation}
            key={selectedConversation?.id}
            onBack={() => setSelectedConversation(null)}
          />
        </div>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
