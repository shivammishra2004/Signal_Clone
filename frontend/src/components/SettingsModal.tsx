"use client";

import React, { useState } from 'react';
import { api } from '@/api';
import { useAuth } from '@/AuthContext';
import { useToast } from '@/ToastContext';

interface Props {
  onClose: () => void;
}

type Tab = 'profile' | 'privacy' | 'notifications' | 'appearance';

export function SettingsModal({ onClose }: Props) {
  const { user, checkAuth } = useAuth();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data: any = {};
      if (displayName.trim() !== user?.display_name) data.display_name = displayName.trim();
      if (avatarUrl.trim() !== user?.avatar_url) data.avatar_url = avatarUrl.trim();
      
      if (Object.keys(data).length > 0) {
        await api.patch('/auth/me', data);
        await checkAuth(); // Refresh user context
        toast.success('Profile updated');
      }
    } catch (err) {
      toast.error('Failed to update profile');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="animate-scale-in" style={{ width: '100%', maxWidth: '600px', backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-color)', display: 'flex', height: '70vh', minHeight: '400px', overflow: 'hidden' }}>
        
        {/* Sidebar Tabs */}
        <div style={{ width: '200px', borderRight: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', padding: '1rem 0' }}>
          <div style={{ padding: '0 1rem 1rem', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>Settings</div>
          
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              { id: 'profile', icon: '👤', label: 'Profile' },
              { id: 'privacy', icon: '🔒', label: 'Privacy' },
              { id: 'notifications', icon: '🔔', label: 'Notifications' },
              { id: 'appearance', icon: '🎨', label: 'Appearance' },
              { id: 'devices', icon: '💻', label: 'Linked Devices' },
              { id: 'encryption', icon: '🛡️', label: 'Encryption' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                style={{
                  background: activeTab === tab.id ? 'var(--bg-tertiary)' : 'transparent',
                  border: 'none', textAlign: 'left', padding: '0.75rem 1.5rem',
                  color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer', fontSize: '0.88rem', fontWeight: activeTab === tab.id ? 600 : 400,
                  borderLeft: activeTab === tab.id ? '3px solid var(--accent-primary)' : '3px solid transparent',
                  display: 'flex', gap: '0.75rem', alignItems: 'center'
                }}
              >
                <span>{tab.icon}</span> {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, padding: '2rem', overflowY: 'auto', position: 'relative' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
          
          {activeTab === 'profile' && (
            <div className="animate-fade-in">
              <h2 style={{ marginBottom: '1.5rem', fontWeight: 600 }}>Profile Settings</h2>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: avatarUrl ? `url(${avatarUrl}) center/cover` : 'linear-gradient(135deg, var(--accent-primary), #6B7FFF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 700, border: '2px solid var(--border-color)' }}>
                  {!avatarUrl && (displayName.charAt(0).toUpperCase() || '?')}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontWeight: 600 }}>{user?.username}</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>Your username cannot be changed.</p>
                </div>
              </div>

              <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: 600 }}>Display Name</label>
                  <input
                    type="text"
                    className="input-field"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: 600 }}>Avatar URL (Optional)</label>
                  <input
                    type="url"
                    className="input-field"
                    value={avatarUrl}
                    onChange={e => setAvatarUrl(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem' }}
                    placeholder="https://example.com/avatar.png"
                  />
                </div>
                
                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="animate-fade-in">
              <h2 style={{ marginBottom: '1.5rem', fontWeight: 600 }}>Privacy</h2>
              <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '2rem' }}>🔒</span>
                <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Read receipts and typing indicators can be toggled here.</p>
                <button onClick={() => toast.info('Disappearing messages coming soon!')} className="btn-primary" style={{ marginTop: '1rem' }}>Enable Disappearing Messages</button>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="animate-fade-in">
              <h2 style={{ marginBottom: '1.5rem', fontWeight: 600 }}>Notifications</h2>
              <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '2rem' }}>🔔</span>
                <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Notification sounds and push alerts settings coming soon.</p>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="animate-fade-in">
              <h2 style={{ marginBottom: '1.5rem', fontWeight: 600 }}>Appearance</h2>
              <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '2rem' }}>🎨</span>
                <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Light mode toggle and chat wallpaper options coming soon.</p>
              </div>
            </div>
          )}
          
          {activeTab === 'devices' && (
            <div className="animate-fade-in">
              <h2 style={{ marginBottom: '1.5rem', fontWeight: 600 }}>Linked Devices</h2>
              <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '2rem' }}>💻</span>
                <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Link your iPad or Desktop client here. (Coming Soon)</p>
              </div>
            </div>
          )}
          
          {activeTab === 'encryption' && (
            <div className="animate-fade-in">
              <h2 style={{ marginBottom: '1.5rem', fontWeight: 600 }}>End-to-End Encryption</h2>
              <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '2rem' }}>🛡️</span>
                <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Your messages are secured with end-to-end encryption. Verify safety numbers here. (Coming Soon)</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
