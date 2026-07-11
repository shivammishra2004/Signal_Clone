"use client";

import React, { useEffect, useRef } from 'react';
import { X, Command } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export function ShortcutsModal({ onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  const shortcuts = [
    { keys: ['Esc'], desc: 'Close chat / modals' },
    { keys: ['Ctrl', '/'], desc: 'Show this shortcuts menu' },
    { keys: ['Alt', 'N'], desc: 'Start a new conversation' },
    { keys: ['Enter'], desc: 'Send message' },
  ];

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="animate-fade-in"
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 500
      }}
    >
      <div
        className="animate-slide-up"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderRadius: 'var(--radius-lg)',
          width: '90%', maxWidth: '400px',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden', border: '1px solid var(--border-color)'
        }}
      >
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-secondary)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Command size={18} className="text-accent" /> Keyboard Shortcuts
          </h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: '0.2rem', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {shortcuts.map((sc, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{sc.desc}</span>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                {sc.keys.map(k => (
                  <kbd key={k} style={{ 
                    backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', 
                    borderRadius: '4px', padding: '0.2rem 0.5rem', fontSize: '0.75rem', 
                    fontFamily: 'monospace', color: 'var(--text-secondary)', boxShadow: '0 1px 1px rgba(0,0,0,0.1)'
                  }}>
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
