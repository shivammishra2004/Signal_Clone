"use client";

import React, { useEffect, useState, useRef } from 'react';
import { api } from '@/api';
import { useWebSocket } from '@/WebSocketContext';
import { useAuth } from '@/AuthContext';
import { useToast } from '@/ToastContext';
import { CreateGroupModal } from '@/components/CreateGroupModal';
import { Camera, Plus, MessageSquare, Users } from 'lucide-react';

interface Participant {
  user_id: string;
  role: string;
  user: { id: string; display_name: string; is_online: boolean; username?: string; avatar_url?: string; };
}

interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  avatar_url?: string;
  last_message_at?: string;
  last_message_preview?: string;
  unread_count?: number;
  participants: Participant[];
}

interface Props {
  onSelect: (conv: Conversation) => void;
  selectedId?: string;
}

function ConvSkeleton() {
  return (
    <div style={{ padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
      <div className="skeleton" style={{ width: '46px', height: '46px', borderRadius: '50%', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        <div className="skeleton" style={{ height: '13px', width: '55%', borderRadius: '4px' }} />
        <div className="skeleton" style={{ height: '11px', width: '80%', borderRadius: '4px' }} />
      </div>
    </div>
  );
}

export function ConversationList({ onSelect, selectedId }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const { subscribe } = useWebSocket();
  const { user } = useAuth();
  const toast = useToast();

  useEffect(() => {
    const cached = localStorage.getItem('conversations_cache');
    if (cached) {
      try {
        setConversations(JSON.parse(cached));
        setLoading(false);
      } catch (e) {}
    }
    fetchConversations();
  }, []);

  useEffect(() => {
    const u1 = subscribe('message.new', (payload: any) => {
      fetchConversations();
      if (payload && payload.sender_id !== user?.id) {
        api.post(`/conversations/${payload.conversation_id}/delivered`, { message_id: payload.id }).catch(console.error);
      }
    });
    const u2 = subscribe('conversation.added', () => { fetchConversations(); toast.info('You were added to a new group!'); });
    const u3 = subscribe('conversation.updated', () => fetchConversations());
    const u4 = subscribe('presence.update', (payload) => {
      setConversations(prev => prev.map(conv => ({
        ...conv,
        participants: conv.participants.map(p =>
          p.user_id === payload.user_id ? { ...p, user: { ...p.user, is_online: payload.is_online } } : p
        )
      })));
    });
    // Refresh unread counts when any message is read
    const u5 = subscribe('message.read', () => fetchConversations());

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => { u1(); u2(); u3(); u4(); u5(); window.removeEventListener('keydown', handleKeyDown); };
  }, [subscribe]);

  const fetchConversations = async () => {
    try {
      const data = await api.get('/conversations/');
      setConversations(data);
      localStorage.setItem('conversations_cache', JSON.stringify(data));
    } catch { } finally { setLoading(false); }
  };

  const getChatName = (conv: Conversation) => {
    if (conv.type === 'group') return conv.name || 'Group Chat';
    const other = conv.participants.find(p => p.user_id !== user?.id);
    return other?.user?.display_name || 'Unknown';
  };

  const isOnline = (conv: Conversation) => {
    if (conv.type === 'group') return false;
    return conv.participants.find(p => p.user_id !== user?.id)?.user?.is_online || false;
  };

  const createNewDirect = async () => {
    setShowNewMenu(false);
    const identifier = prompt("Enter username or phone number:");
    if (!identifier) return;
    try {
      const res = await api.get(`/contacts/search?q=${identifier}`);
      if (!res.length) { toast.error('User not found.'); return; }
      const newConv = await api.post('/conversations/', { type: 'direct', participant_ids: [res[0].id] });
      fetchConversations();
      onSelect(newConv);
      toast.success(`Chat with ${res[0].display_name} started!`);
    } catch { toast.error('Failed to create chat.'); }
  };

  const formatTime = (ts?: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const filteredConversations = conversations.filter(conv => 
    getChatName(conv).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {showGroupModal && (
        <CreateGroupModal
          onClose={() => setShowGroupModal(false)}
          onCreated={(conv) => { fetchConversations(); onSelect(conv); toast.success('Group created!'); }}
        />
      )}

      <div style={{ flex: 1, borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-secondary)', height: '100%', position: 'relative' }}>

        {/* Header */}
        <div style={{ padding: '1.25rem 1rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--glass-bg)', backdropFilter: 'blur(20px)' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Messages</h2>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1px' }}>
              {conversations.length} {conversations.length === 1 ? 'conversation' : 'conversations'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button onClick={() => toast.info('Stories coming soon!')} className="btn-ghost" style={{ padding: '0.45rem', borderRadius: '50%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
              <Camera size={20} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
          <input
            ref={searchInputRef}
            type="text"
            className="input-field"
            placeholder="Search chats... (/)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '0.5rem 0.8rem', fontSize: '0.85rem' }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }} onClick={() => setShowNewMenu(false)}>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <ConvSkeleton key={i} />)
          ) : filteredConversations.length === 0 ? (
            <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💬</div>
              <p style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.4rem' }}>No chats found</p>
            </div>
          ) : (
            filteredConversations.map(conv => {
              const isSelected = conv.id === selectedId;
              const online = isOnline(conv);
              const isGroup = conv.type === 'group';
              const displayUnread = isSelected ? 0 : conv.unread_count;
              const other = conv.participants.find(p => p.user_id !== user?.id);
              const avatar = isGroup ? conv.avatar_url : other?.user?.avatar_url;

              return (
                <div key={conv.id} onClick={() => {
                  setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
                  onSelect(conv);
                }} className={`conv-item ${isSelected ? 'active' : ''}`}
                  style={{ padding: '0.85rem 1rem', margin: '0.25rem 0.5rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>

                  {/* Avatar */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: isGroup ? 'linear-gradient(135deg, rgba(160,96,255,0.3), rgba(79,128,255,0.2))' : 'linear-gradient(135deg, rgba(79,128,255,0.25), rgba(107,127,255,0.15))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isGroup ? '1.2rem' : '1.1rem', fontWeight: 700, color: isGroup ? 'var(--accent-purple)' : 'var(--accent-primary)', border: isSelected ? '2px solid var(--accent-primary)' : '2px solid transparent', transition: 'border-color 0.2s', overflow: 'hidden' }}>
                      {avatar ? <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (isGroup ? '👥' : getChatName(conv).charAt(0).toUpperCase())}
                    </div>
                    {!isGroup && online && <div className="online-dot" style={{ position: 'absolute', bottom: '1px', right: '1px' }} />}
                  </div>

                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.2rem' }}>
                      <span style={{ fontWeight: displayUnread ? 700 : 600, fontSize: '0.9rem', color: displayUnread ? 'var(--text-primary)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                        {getChatName(conv)}
                      </span>
                      {conv.last_message_at && (
                        <span style={{ fontSize: '0.7rem', color: displayUnread ? 'var(--accent-primary)' : 'var(--text-muted)', flexShrink: 0, marginLeft: '0.5rem', fontWeight: displayUnread ? 600 : 400 }}>
                          {formatTime(conv.last_message_at)}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: displayUnread ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: displayUnread ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, paddingRight: '0.5rem' }}>
                        {conv.last_message_preview || (isGroup ? `${conv.participants.length} members` : 'Start a conversation')}
                      </div>
                      {!!displayUnread && (
                        <div style={{ background: 'var(--accent-primary)', color: 'white', fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '10px', minWidth: '1.2rem', textAlign: 'center' }}>
                          {displayUnread}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Floating Action Button for New Chat */}
        <button onClick={() => setShowNewMenu(v => !v)} className="fab" title="New Chat">
          <MessageSquare size={24} />
        </button>

        {/* FAB Menu */}
        {showNewMenu && (
          <div className="animate-fade-in" style={{ position: 'absolute', bottom: '4.5rem', right: '1.25rem', zIndex: 300, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden', minWidth: '170px', boxShadow: 'var(--shadow-lg)' }}>
            {[
              { icon: <MessageSquare size={16} />, label: 'Direct Chat', action: createNewDirect },
              { icon: <Users size={16} />, label: 'Group Chat', action: () => { setShowNewMenu(false); setShowGroupModal(true); } }
            ].map(item => (
              <button key={item.label} onClick={item.action} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.8rem 1rem', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>{item.icon}</span> {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
