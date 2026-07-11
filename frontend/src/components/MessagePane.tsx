"use client";

import React, { useEffect, useState, useRef } from 'react';
import { api } from '@/api';
import { useWebSocket } from '@/WebSocketContext';
import { useAuth } from '@/AuthContext';
import { useToast } from '@/ToastContext';
import { Phone, Video, Paperclip, Timer, Pencil, Trash2, Reply, SmilePlus, Send, X, ChevronLeft } from 'lucide-react';

interface ReactionSummary {
  emoji: string;
  count: number;
  user_ids: string[];
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  status?: 'sent' | 'delivered' | 'read';
  reply_to_id?: string;
  reply_to_preview?: string;
  reactions?: ReactionSummary[];
}

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
  created_by?: string;
  participants: Participant[];
}

interface Props {
  conversation: Conversation | null;
  onBack?: () => void;
}

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export function MessagePane({ conversation, onBack }: Props) {
  const { user } = useAuth();
  const { subscribe, sendMessage } = useWebSocket();
  const toast = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);

  // Group editing state
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [avatarInput, setAvatarInput] = useState('');
  const [addSearch, setAddSearch] = useState('');
  const [addSearchResults, setAddSearchResults] = useState<any[]>([]);
  const [disappearingMode, setDisappearingMode] = useState(false);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [groupInfoConv, setGroupInfoConv] = useState<Conversation | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const receiveTypingTimeoutsRef = useRef<{ [userId: string]: NodeJS.Timeout }>({});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (conversation) {
      fetchMessages();
      setTypingUsers(new Set());
      setShowGroupInfo(false);
      setReplyTo(null);
      setActiveReactionMsgId(null);
      setEditingName(false);
      setAddSearch('');
      setAddSearchResults([]);
      setGroupInfoConv(conversation);
      Object.values(receiveTypingTimeoutsRef.current).forEach(clearTimeout);
      receiveTypingTimeoutsRef.current = {};
    } else {
      setMessages([]);
      setGroupInfoConv(null);
    }
  }, [conversation]);

  useEffect(() => {
    if (!conversation) return;

    const u1 = subscribe('message.new', (payload: Message) => {
      if (payload.conversation_id === conversation.id) {
        setMessages(prev => [...prev, payload]);
        // Auto-read if we are currently viewing this chat and someone else sent it.
        // This also sets last_delivered_message_id on our participant record.
        if (payload.sender_id !== user?.id) {
          api.post(`/conversations/${conversation.id}/read`, { message_id: payload.id }).catch(console.error);
        }
      }
    });

    const u2 = subscribe('message.delivered', (payload: { message_id: string; user_id: string }) => {
      // Mark all messages up to this one as delivered (it's a watermark)
      setMessages(prev => prev.map(msg =>
        msg.id <= payload.message_id && msg.status !== 'read' ? { ...msg, status: 'delivered' } : msg
      ));
    });

    const u3 = subscribe('message.reaction', (payload: { message_id: string; reactions: ReactionSummary[] }) => {
      setMessages(prev => prev.map(msg =>
        msg.id === payload.message_id ? { ...msg, reactions: payload.reactions } : msg
      ));
    });

    const u4 = subscribe('message.read', (payload: { conversation_id: string; up_to_message_id: string; user_id: string }) => {
      if (payload.conversation_id === conversation.id && payload.user_id !== user?.id) {
        // Mark ALL messages up to this watermark as read (not just the exact one)
        setMessages(prev => prev.map(m =>
          m.id <= payload.up_to_message_id && m.sender_id === user?.id ? { ...m, status: 'read' } : m
        ));
      }
    });

    const u5 = subscribe('typing.update', (payload: { conversation_id: string; user_id: string; is_typing: boolean }) => {
      if (payload.conversation_id === conversation.id) {
        setTypingUsers(prev => {
          const s = new Set(prev);
          if (payload.is_typing) {
            s.add(payload.user_id);
            if (receiveTypingTimeoutsRef.current[payload.user_id]) clearTimeout(receiveTypingTimeoutsRef.current[payload.user_id]);
            receiveTypingTimeoutsRef.current[payload.user_id] = setTimeout(() => {
              setTypingUsers(c => { const u = new Set(c); u.delete(payload.user_id); return u; });
            }, 3000);
          } else {
            s.delete(payload.user_id);
            if (receiveTypingTimeoutsRef.current[payload.user_id]) { clearTimeout(receiveTypingTimeoutsRef.current[payload.user_id]); delete receiveTypingTimeoutsRef.current[payload.user_id]; }
          }
          return s;
        });
      }
    });

    const u6 = subscribe('message.deleted', (payload: { message_id: string }) => {
      setMessages(prev => prev.filter(msg => msg.id !== payload.message_id));
    });

    const u7 = subscribe('presence.update', (payload: { user_id: string; is_online: boolean }) => {
      setGroupInfoConv(prev => {
        const base = prev || conversation;
        if (!base) return base;
        return {
          ...base,
          participants: base.participants.map(p => 
            p.user_id === payload.user_id ? { ...p, user: { ...p.user, is_online: payload.is_online } } : p
          )
        };
      });
    });

    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); };
  }, [conversation, subscribe, sendMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, typingUsers]);

  const fetchMessages = async () => {
    try {
      const data = await api.get(`/conversations/${conversation!.id}/messages`);
      setMessages(data);
      // Mark read
      if (data.length > 0) {
        const lastMsg = data[data.length - 1];
        if (lastMsg.sender_id !== user?.id) {
          api.post(`/conversations/${conversation!.id}/read`, { message_id: lastMsg.id }).catch(console.error);
        }
      }
    } catch (err) { console.error(err); }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !conversation) return;
    const content = inputText.trim();
    setInputText('');
    sendMessage('typing.stop', { conversation_id: conversation.id });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    try {
      const body: any = { content };
      if (replyTo) body.reply_to_id = replyTo.id;
      const newMsg = await api.post(`/conversations/${conversation.id}/messages`, body);
      setMessages(prev => [...prev, newMsg]);
      setInputText('');
      setReplyTo(null);

      // Disappearing mode functionality
      if (disappearingMode) {
        setTimeout(() => {
          api.delete(`/conversations/${conversation.id}/messages/${newMsg.id}`).catch(console.error);
        }, 10000);
      }
    } catch (err) {
      toast.error('Failed to send message');
      console.error(err);
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (conversation) {
      sendMessage('typing.start', { conversation_id: conversation.id });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendMessage('typing.stop', { conversation_id: conversation.id });
      }, 2000);
    }
  };

  const handleReact = async (messageId: string, emoji: string) => {
    setActiveReactionMsgId(null);
    try {
      await api.post(`/conversations/${conversation!.id}/messages/${messageId}/react?emoji=${encodeURIComponent(emoji)}`, {});
    } catch (err) { console.error(err); }
  };

  // === EMPTY STATE ===
  if (!conversation) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)' }}>
        <div className="animate-fade-in" style={{ textAlign: 'center', maxWidth: '320px' }}>
          <div style={{ width: '88px', height: '88px', borderRadius: '28px', background: 'linear-gradient(135deg, rgba(79,128,255,0.15), rgba(160,96,255,0.10))', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '2.4rem' }}>💬</span>
          </div>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '1.15rem', marginBottom: '0.5rem' }}>Your Messages</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.5 }}>Select a conversation from the sidebar or start a new one to begin messaging.</p>
        </div>
      </div>
    );
  }

  const isGroup = conversation.type === 'group';
  const isAdmin = conversation.created_by === user?.id;

  const getChatName = () => {
    const active = groupInfoConv || conversation;
    if (isGroup) return active.name || 'Group Chat';
    const other = active.participants.find(p => p.user_id !== user?.id);
    return other?.user?.display_name || 'Unknown User';
  };

  const getTypingLabel = () => {
    const active = groupInfoConv || conversation;
    const names = Array.from(typingUsers)
      .map(uid => active.participants.find(p => p.user_id === uid)?.user?.display_name || 'Someone')
      .slice(0, 2);
    if (!names.length) return null;
    return names.join(', ') + (names.length > 1 ? ' are' : ' is') + ' typing';
  };

  const getSenderName = (senderId: string) => {
    const active = groupInfoConv || conversation;
    return active.participants.find(p => p.user_id === senderId)?.user?.display_name || 'Unknown';
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)', position: 'relative', minHeight: 0, overflow: 'hidden' }}
      onClick={() => setActiveReactionMsgId(null)}>

      {/* ===== HEADER ===== */}
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--glass-bg)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', gap: '0.85rem', zIndex: 10, flexShrink: 0 }}>
        {onBack && (
          <button onClick={onBack} className="btn-ghost mobile-only flex" style={{ padding: '0.3rem', marginRight: '-0.3rem', display: 'flex', alignItems: 'center' }}>
            <ChevronLeft size={22} />
          </button>
        )}
        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: isGroup ? 'linear-gradient(135deg, rgba(160,96,255,0.3), rgba(79,128,255,0.2))' : 'linear-gradient(135deg, rgba(79,128,255,0.25), rgba(107,127,255,0.15))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 700, color: isGroup ? 'var(--accent-purple)' : 'var(--accent-primary)', overflow: 'hidden', flexShrink: 0 }}>
          {(() => {
            const active = groupInfoConv || conversation;
            const avatar = isGroup ? active.avatar_url : active.participants.find((p: any) => p.user_id !== user?.id)?.user?.avatar_url;
            return avatar ? <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (isGroup ? '👥' : getChatName().charAt(0).toUpperCase());
          })()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {editingName ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <input 
                  className="input-field" 
                  value={nameInput} 
                  placeholder="Group Name"
                  onChange={e => setNameInput(e.target.value)} 
                  onKeyDown={async e => {
                    if (e.key === 'Enter') {
                      if (!nameInput.trim()) return; 
                      try { 
                        const payload: any = { name: nameInput.trim() };
                        if (avatarInput.trim()) payload.avatar_url = avatarInput.trim();
                        const u = await api.put(`/conversations/${conversation.id}/group`, payload); 
                        setGroupInfoConv(u); 
                        setEditingName(false); 
                        toast.success('Group updated'); 
                      } catch { 
                        toast.error('Failed'); 
                      }
                    } else if (e.key === 'Escape') {
                      setEditingName(false);
                    }
                  }}
                  style={{ padding: '0.2rem 0.5rem', fontSize: '1rem', fontWeight: 600, width: '200px' }} 
                  autoFocus 
                />
                <input 
                  className="input-field" 
                  value={avatarInput} 
                  placeholder="Avatar URL (Optional)"
                  onChange={e => setAvatarInput(e.target.value)} 
                  onKeyDown={async e => {
                    if (e.key === 'Enter') {
                      if (!nameInput.trim()) return; 
                      try { 
                        const payload: any = { name: nameInput.trim() };
                        if (avatarInput.trim()) payload.avatar_url = avatarInput.trim();
                        const u = await api.put(`/conversations/${conversation.id}/group`, payload); 
                        setGroupInfoConv(u); 
                        setEditingName(false); 
                        toast.success('Group updated'); 
                      } catch { 
                        toast.error('Failed'); 
                      }
                    } else if (e.key === 'Escape') {
                      setEditingName(false);
                    }
                  }}
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', width: '200px' }} 
                />
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Press Enter to save</span>
              </div>
            ) : (
              <>
                <h2 style={{ fontSize: '1rem', margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>{getChatName()}</h2>
                {isGroup && isAdmin && (
                  <button onClick={() => { 
                    setNameInput(groupInfoConv?.name || conversation.name || ''); 
                    setAvatarInput((groupInfoConv as any)?.avatar_url || (conversation as any).avatar_url || '');
                    setEditingName(true); 
                  }} className="btn-ghost" style={{ padding: '0.2rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}>
                    <Pencil size={14} />
                  </button>
                )}
              </>
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: isGroup ? 'var(--text-muted)' : ((groupInfoConv || conversation).participants.find(p => p.user_id !== user?.id)?.user?.is_online ? 'var(--accent-success)' : 'var(--text-muted)') }}>
            {isGroup ? `${(groupInfoConv || conversation).participants.length} members` : ((groupInfoConv || conversation).participants.find(p => p.user_id !== user?.id)?.user?.is_online ? '● Online' : 'Offline')}
          </div>
        </div>
        {/* Placeholder Actions */}
        <div style={{ display: 'flex', gap: '0.5rem', marginRight: '0.5rem', alignItems: 'center' }}>
          <button 
            onClick={() => { setDisappearingMode(v => !v); toast.info(disappearingMode ? 'Disappearing messages off' : 'Disappearing messages on (10s)'); }} 
            className="btn-ghost" 
            style={{ fontSize: '1rem', padding: '0.4rem', borderRadius: '50%', color: disappearingMode ? 'var(--accent-success)' : 'inherit', background: disappearingMode ? 'var(--bg-tertiary)' : 'transparent', display: 'flex', alignItems: 'center' }}
            title="Disappearing Messages (10s)"
          >
            <Timer size={18} />
          </button>
          <button onClick={() => toast.info('Voice calls coming soon!')} className="btn-ghost" style={{ fontSize: '1rem', padding: '0.4rem', borderRadius: '50%', display: 'flex', alignItems: 'center' }}><Phone size={18} /></button>
          <button onClick={() => toast.info('Video calls coming soon!')} className="btn-ghost" style={{ fontSize: '1rem', padding: '0.4rem', borderRadius: '50%', display: 'flex', alignItems: 'center' }}><Video size={18} /></button>
        </div>
        {isGroup && (
          <button onClick={() => setShowGroupInfo(v => !v)} className="btn-ghost" style={{ fontSize: '0.8rem' }}>
            {showGroupInfo ? '✕ Close Info' : 'ℹ Group Info'}
          </button>
        )}
      </div>

      {/* ===== GROUP INFO PANEL ===== */}
      {showGroupInfo && isGroup && (() => {
        const dc = groupInfoConv || conversation;
        return (
          <div style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', padding: '1rem 1.5rem', maxHeight: '40vh', overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.35rem' }}>Group Name</p>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{dc.name || 'Unnamed'}</span>
            </div>

            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.35rem' }}>Members ({dc.participants.length})</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
              {dc.participants.map(p => (
                <div key={p.user_id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.25rem 0' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-primary)', flexShrink: 0, overflow: 'hidden' }}>
                    {p.user?.avatar_url ? <img src={p.user.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (p.user?.display_name?.charAt(0).toUpperCase() || '?')}
                  </div>
                  <span style={{ flex: 1, color: 'var(--text-primary)', fontSize: '0.85rem' }}>{p.user?.display_name}</span>
                  {p.role === 'admin' && <span style={{ fontSize: '0.65rem', color: 'var(--accent-purple)', background: 'var(--accent-purple-dim)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>Admin</span>}
                  {p.user?.is_online && <span className="online-dot" style={{ width: '7px', height: '7px' }} />}
                  {isAdmin && p.user_id !== user?.id && (
                    <button onClick={async () => { if (!confirm(`Remove ${p.user?.display_name}?`)) return; try { const u = await api.put(`/conversations/${conversation.id}/group`, { remove_participant_ids: [p.user_id] }); setGroupInfoConv(u); toast.info(`${p.user?.display_name} removed`); } catch { toast.error('Failed'); } }} style={{ background: 'none', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                  )}
                </div>
              ))}
            </div>

            {isAdmin && (
              <div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.35rem' }}>Add Member</p>
                <input className="input-field" placeholder="Search username..." value={addSearch} onChange={async e => { const q = e.target.value; setAddSearch(q); if (q.trim().length < 1) { setAddSearchResults([]); return; } try { const r = await api.get(`/contacts/search?q=${q}`); const ids = new Set(dc.participants.map((p: any) => p.user_id)); setAddSearchResults(r.filter((u: any) => !ids.has(u.id))); } catch { setAddSearchResults([]); } }} style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }} />
                {addSearchResults.length > 0 && (
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', marginTop: '0.3rem', maxHeight: '120px', overflowY: 'auto', background: 'var(--bg-primary)' }}>
                    {addSearchResults.map((u: any) => (
                      <div key={u.id} onClick={async () => { try { const up = await api.put(`/conversations/${conversation.id}/group`, { add_participant_ids: [u.id] }); setGroupInfoConv(up); setAddSearch(''); setAddSearchResults([]); toast.success(`${u.display_name} added`); } catch { toast.error('Failed'); } }} style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <strong>{u.display_name}</strong>
                        <span style={{ marginLeft: 'auto', color: 'var(--accent-primary)', fontSize: '0.78rem' }}>+ Add</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ===== MESSAGES ===== */}
      <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {messages.map((msg, idx) => {
          const isMine = msg.sender_id === user?.id;
          const showSender = isGroup && !isMine && (idx === 0 || messages[idx - 1].sender_id !== msg.sender_id);
          const hasReactions = msg.reactions && msg.reactions.length > 0;

          return (
            <div key={msg.id} 
                 onMouseEnter={() => setHoveredMsgId(msg.id)}
                 onMouseLeave={() => setHoveredMsgId(null)}
                 onClick={(e) => { e.stopPropagation(); setHoveredMsgId(hoveredMsgId === msg.id ? null : msg.id); }}
                 style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', position: 'relative', marginBottom: hasReactions ? '1.2rem' : '0.15rem' }}>

              {showSender && (
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.15rem', paddingLeft: '0.4rem', fontWeight: 600 }}>
                  {getSenderName(msg.sender_id)}
                </div>
              )}

              {/* Reply quote */}
              {msg.reply_to_preview && (
                <div style={{ maxWidth: '70%', padding: '0.4rem 0.75rem', marginBottom: '0.2rem', borderLeft: '3px solid var(--accent-primary)', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', backgroundColor: 'rgba(79,128,255,0.08)', fontSize: '0.78rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {msg.reply_to_preview}
                </div>
              )}

              {/* Bubble */}
              <div
                className="message-bubble"
                style={{
                  maxWidth: '70%', padding: '0.7rem 1rem', position: 'relative',
                  borderRadius: 'var(--radius-md)',
                  borderBottomRightRadius: isMine ? '4px' : 'var(--radius-md)',
                  borderBottomLeftRadius: !isMine ? '4px' : 'var(--radius-md)',
                  background: isMine ? 'linear-gradient(135deg, var(--accent-primary), #6B7FFF)' : 'var(--bg-tertiary)',
                  color: isMine ? '#fff' : 'var(--text-primary)',
                  boxShadow: 'var(--shadow-xs)'
                }}
              >
                <div style={{ lineHeight: 1.45, fontSize: '0.9rem' }}>{msg.content}</div>
                <div style={{ fontSize: '0.65rem', color: isMine ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)', marginTop: '0.3rem', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '0.25rem', alignItems: 'center' }}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {isMine && (
                    <span style={{ 
                      fontSize: '0.75rem', 
                      color: msg.status === 'read' ? 'var(--accent-success)' : 'inherit',
                      textShadow: msg.status === 'read' ? '0 0 2px rgba(46,213,115,0.4)' : 'none',
                      fontWeight: msg.status === 'read' ? 800 : 'normal'
                    }}>
                      {msg.status === 'sent' || !msg.status ? '✓' : '✓✓'}
                    </span>
                  )}
                </div>

                {/* Hover Action Bar */}
                {hoveredMsgId === msg.id && activeReactionMsgId !== msg.id && (
                  <div className="animate-fade-in" style={{
                    position: 'absolute', [isMine ? 'right' : 'left']: '10px', top: '-15px',
                    display: 'flex', gap: '4px', backgroundColor: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)',
                    padding: '2px', boxShadow: 'var(--shadow-sm)', zIndex: 20
                  }}>
                    <button onClick={(e) => { e.stopPropagation(); setActiveReactionMsgId(msg.id); }} className="btn-ghost" style={{ padding: '0.3rem', borderRadius: '4px', display: 'flex' }} title="React">
                      <SmilePlus size={14} color="var(--text-muted)" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setReplyTo(msg); inputRef.current?.focus(); }} className="btn-ghost" style={{ padding: '0.3rem', borderRadius: '4px', display: 'flex' }} title="Reply">
                      <Reply size={14} color="var(--text-muted)" />
                    </button>
                    {isMine && (
                      <button onClick={(e) => { e.stopPropagation(); api.delete(`/conversations/${conversation.id}/messages/${msg.id}`).catch(console.error); }} className="btn-ghost hover-danger" style={{ padding: '0.3rem', borderRadius: '4px', display: 'flex' }} title="Delete">
                        <Trash2 size={14} color="var(--text-muted)" />
                      </button>
                    )}
                  </div>
                )}

                {/* Reaction picker overlay */}
                {activeReactionMsgId === msg.id && (
                  <div onClick={e => e.stopPropagation()} style={{
                    position: 'absolute', [isMine ? 'right' : 'left']: 0, bottom: '100%', marginBottom: '4px', zIndex: 50,
                    display: 'flex', gap: '2px', padding: '0.3rem 0.4rem',
                    backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-full)', boxShadow: 'var(--shadow-md)',
                  }}>
                    {['👍','❤️','😂','😮','😢','🙏'].map(emoji => (
                      <button key={emoji} onClick={() => handleReact(msg.id, emoji)} className="reaction-btn" style={{ fontSize: '1.2rem', padding: '0.2rem 0.4rem', background: 'none', border: 'none', cursor: 'pointer', transition: 'transform 0.1s' }} onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')} onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                        {emoji}
                      </button>
                    ))}
                    <button onClick={() => setActiveReactionMsgId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', marginLeft: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Reaction badges */}
              {hasReactions && (
                <div style={{ display: 'flex', gap: '3px', marginTop: '3px', flexWrap: 'wrap' }}>
                  {msg.reactions!.map(r => (
                    <button key={r.emoji} onClick={() => handleReact(msg.id, r.emoji)} style={{
                      display: 'flex', alignItems: 'center', gap: '3px',
                      padding: '0.15rem 0.4rem', borderRadius: 'var(--radius-full)',
                      background: r.user_ids.includes(user?.id || '') ? 'var(--accent-primary-glow)' : 'var(--bg-tertiary)',
                      border: r.user_ids.includes(user?.id || '') ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                      fontSize: '0.78rem', cursor: 'pointer', color: 'var(--text-primary)',
                      transition: 'all 0.15s',
                    }}>
                      <span>{r.emoji}</span>
                      <span style={{ fontSize: '0.68rem', fontWeight: 600 }}>{r.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Typing indicator */}
        {typingUsers.size > 0 && (
          <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.82rem', padding: '0.3rem 0' }}>
            <div style={{ display: 'flex', gap: '3px' }}>
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
            </div>
            {getTypingLabel()}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ===== INPUT AREA ===== */}
      <div style={{ backgroundColor: 'transparent', flexShrink: 0, padding: '0 1rem 1rem' }}>
        {/* Reply preview bar */}
        {replyTo && (
          <div style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: 'var(--glass-bg)', backdropFilter: 'blur(10px)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', borderBottom: 'none' }}>
            <div style={{ borderLeft: '3px solid var(--accent-primary)', paddingLeft: '0.6rem', flex: 1, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-primary)' }}>Replying to {getSenderName(replyTo.sender_id)}</span>
                <button onClick={() => setReplyTo(null)} className="btn-ghost" style={{ padding: '0.2rem', color: 'var(--text-muted)' }}>
                  <X size={14} />
                </button>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {replyTo.content}
              </div>
            </div>
          </div>
        )}

        <div>
          <form onSubmit={handleSend} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', backgroundColor: 'var(--bg-tertiary)', padding: '0.4rem 0.5rem 0.4rem 0.5rem', borderRadius: replyTo ? '0 0 var(--radius-lg) var(--radius-lg)' : 'var(--radius-full)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)', transition: 'border-radius 0.2s' }}>
            <button type="button" onClick={() => toast.info('Attachments coming soon!')} className="btn-ghost" style={{ padding: '0.5rem', borderRadius: '50%', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              <Paperclip size={20} />
            </button>
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={handleTyping}
              placeholder={disappearingMode ? "Disappearing message..." : "Type a message..."}
              style={{ flex: 1, padding: '0.5rem', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.95rem', fontFamily: 'inherit' }}
            />
            <button type="submit" className="btn-primary" disabled={!inputText.trim()} style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
