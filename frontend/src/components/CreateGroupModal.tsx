"use client";

import React, { useEffect, useState } from 'react';
import { api } from '@/api';
import { useToast } from '@/ToastContext';

interface User {
  id: string;
  display_name: string;
  username?: string;
}

interface Props {
  onClose: () => void;
  onCreated: (conv: any) => void;
}

export function CreateGroupModal({ onClose, onCreated }: Props) {
  const [groupName, setGroupName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const delaySearch = setTimeout(async () => {
      if (searchQuery.trim().length < 1) {
        setSearchResults([]);
        return;
      }
      try {
        const results = await api.get(`/contacts/search?q=${searchQuery}`);
        // Filter out already-selected
        setSearchResults(results.filter((u: User) => !selectedUsers.find(s => s.id === u.id)));
      } catch { setSearchResults([]); }
    }, 300);
    return () => clearTimeout(delaySearch);
  }, [searchQuery, selectedUsers]);

  const addUser = (user: User) => {
    setSelectedUsers(prev => [...prev, user]);
    setSearchResults([]);
    setSearchQuery('');
  };

  const removeUser = (userId: string) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== userId));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) { toast.error('Group name is required.'); return; }
    if (selectedUsers.length < 1) { toast.error('Add at least one participant.'); return; }
    
    setIsLoading(true);
    try {
      const payload: any = {
        name: groupName.trim(),
        participant_ids: selectedUsers.map(u => u.id)
      };
      if (avatarUrl.trim()) payload.avatar_url = avatarUrl.trim();
      const conv = await api.post('/conversations/group', payload);
      onCreated(conv);
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create group.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="modal-content-pad create-group-modal" style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-xl)',
        width: '420px',
        maxWidth: '95vw',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <h2 style={{ margin: '0 0 1.5rem', color: 'var(--text-primary)', fontSize: '1.25rem' }}>
          🧑‍🤝‍🧑 New Group Chat
        </h2>
        
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Group name */}
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
              Group Name
            </label>
            <input
              className="input-field"
              type="text"
              placeholder="e.g. Project Titan"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {/* Avatar URL */}
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
              Avatar URL (Optional)
            </label>
            <input
              className="input-field"
              type="url"
              placeholder="https://example.com/group.png"
              value={avatarUrl}
              onChange={e => setAvatarUrl(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {/* Participant search */}
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
              Add Participants
            </label>
            
            {/* Pill tags for selected users */}
            {selectedUsers.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.6rem' }}>
                {selectedUsers.map(user => (
                  <span key={user.id} style={{
                    backgroundColor: 'var(--accent-primary)', color: '#fff',
                    borderRadius: 'var(--radius-full)', padding: '0.3rem 0.7rem',
                    fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem'
                  }}>
                    {user.display_name}
                    <button
                      type="button"
                      onClick={() => removeUser(user.id)}
                      style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: '1rem' }}
                    >×</button>
                  </span>
                ))}
              </div>
            )}
            
            <input
              className="input-field"
              type="text"
              placeholder="Search username or phone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            
            {/* Search results dropdown */}
            {searchResults.length > 0 && (
              <div style={{
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                maxHeight: '180px',
                overflowY: 'auto',
                marginTop: '0.4rem',
                backgroundColor: 'var(--bg-primary)'
              }}>
                {searchResults.map(user => (
                  <div
                    key={user.id}
                    onClick={() => addUser(user)}
                    style={{
                      padding: '0.75rem 1rem', cursor: 'pointer',
                      color: 'var(--text-primary)', fontSize: '0.9rem',
                      borderBottom: '1px solid var(--border-color)',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <strong>{user.display_name}</strong>
                    {user.username && <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>@{user.username}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" onClick={onClose} className="btn-secondary" style={{ padding: '0.6rem 1.2rem' }}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isLoading} style={{ padding: '0.6rem 1.2rem' }}>
              {isLoading ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
