import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  User as UserIcon,
  CheckCircle,
  Plus,
  MessageSquare,
  Search,
  X,
} from 'lucide-react';
import { Conversation, Message, User, UserSummary } from '../types';
import { apiFetch, formatTimeAgo } from '../api';

interface DirectMessagesProps {
  currentUser: User | null;
  targetUserId?: string | null;
  onClearTargetUser?: () => void;
  onUserClick: (username: string) => void;
}

export const DirectMessages: React.FC<DirectMessagesProps> = ({
  currentUser,
  targetUserId,
  onClearTargetUser,
  onUserClick,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loadingConv, setLoadingConv] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // New Chat Search Modal
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<UserSummary[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Load conversations
  const loadConversations = async () => {
    const { data } = await apiFetch('/api/messages/conversations');
    if (data?.conversations) {
      setConversations(data.conversations);
      return data.conversations;
    }
    return [];
  };

  useEffect(() => {
    loadConversations().then((convs) => {
      setLoadingConv(false);
      // If targetUserId provided (e.g. from profile "Message" button), find or open
      if (targetUserId) {
        const found = convs.find((c: Conversation) => c.otherUser.id === targetUserId);
        if (found) {
          setActiveConv(found);
        } else {
          // Fetch user details to start pending chat
          apiFetch(`/api/users/profile/by-id/${targetUserId}`).then(({ data }) => {
            if (data?.profile) {
              setActiveConv({
                id: 'new',
                lastMessageAt: new Date().toISOString(),
                lastMessage: '',
                unreadCount: 0,
                otherUser: data.profile,
              });
            }
          });
        }
        if (onClearTargetUser) onClearTargetUser();
      } else if (!activeConv && convs.length > 0) {
        setActiveConv(convs[0]);
      }
    });
  }, [targetUserId]);

  // Load messages for active conversation & poll every 3.5s
  useEffect(() => {
    if (!activeConv || activeConv.id === 'new') {
      setMessages([]);
      return;
    }

    let isMounted = true;

    async function fetchMessages() {
      if (!activeConv) return;
      const { data } = await apiFetch(`/api/messages/conversations/${activeConv.id}`);
      if (isMounted && data?.messages) {
        setMessages(data.messages);
      }
    }

    fetchMessages().then(scrollToBottom);
    const interval = setInterval(fetchMessages, 3500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeConv?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  // Search users for new conversation
  useEffect(() => {
    if (!searchUserQuery.trim()) {
      setUserSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await apiFetch(`/api/users/search?q=${encodeURIComponent(searchUserQuery)}`);
      if (data?.users) {
        setUserSearchResults(data.users.filter((u: UserSummary) => u.id !== currentUser?.id));
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchUserQuery, currentUser?.id]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !activeConv || !currentUser || sending) return;

    const content = messageText.trim();
    setMessageText('');
    setSending(true);

    const { data, error } = await apiFetch('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify({
        recipientId: activeConv.otherUser.id,
        content,
      }),
    });

    setSending(false);

    if (data?.message) {
      setMessages((prev) => [...prev, data.message]);
      if (activeConv.id === 'new') {
        activeConv.id = data.message.conversationId;
      }
      activeConv.lastMessage = content;
      activeConv.lastMessageAt = data.message.createdAt;
      setSendError(null);
      loadConversations();
    } else if (error) {
      setSendError(error);
    }
  };

  const handleStartChatWith = (user: UserSummary) => {
    const existing = conversations.find((c) => c.otherUser.id === user.id);
    if (existing) {
      setActiveConv(existing);
    } else {
      setActiveConv({
        id: 'new',
        lastMessageAt: new Date().toISOString(),
        lastMessage: '',
        unreadCount: 0,
        otherUser: user,
      });
      setMessages([]);
    }
    setShowNewChatModal(false);
    setSearchUserQuery('');
  };

  return (
    <div className="w-full max-w-5xl mx-auto pb-24 pt-4 px-3 sm:px-6 h-[calc(100vh-80px)] flex flex-col">
      <div className="bg-[#111622] border border-[#1e293b] rounded-2xl flex-1 flex overflow-hidden shadow-xl">
        {/* LEFT COLUMN: CONVERSATION LIST */}
        <div
          className={`w-full md:w-80 border-r border-[#1e293b] flex flex-col bg-[#0f1420] ${
            activeConv ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* HEADER */}
          <div className="p-4 border-b border-[#1e293b] flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-sky-400" />
              <span>Direct Messages</span>
            </h2>
            <button
              onClick={() => setShowNewChatModal(true)}
              className="p-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 rounded-lg transition-colors"
              title="New Message"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* LIST */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingConv ? (
              <div className="p-4 text-center text-xs text-slate-500">Loading chats...</div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 space-y-3">
                <p className="text-xs">No conversations yet.</p>
                <button
                  onClick={() => setShowNewChatModal(true)}
                  className="px-4 py-1.5 bg-sky-500 text-white rounded-xl text-xs font-semibold hover:bg-sky-400"
                >
                  Start a Chat
                </button>
              </div>
            ) : (
              conversations.map((conv) => {
                const isActive = activeConv?.id === conv.id;
                return (
                  <div
                    key={conv.id}
                    onClick={() => setActiveConv(conv)}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                      isActive ? 'bg-slate-800/80' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <img
                      src={
                        conv.otherUser.avatarUrl ||
                        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'
                      }
                      alt={conv.otherUser.username}
                      className="w-10 h-10 rounded-full object-cover border border-slate-700"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-white truncate">
                          {conv.otherUser.username}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {formatTimeAgo(conv.lastMessageAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{conv.lastMessage}</p>
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="w-2.5 h-2.5 bg-sky-400 rounded-full" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: ACTIVE CHAT */}
        {activeConv ? (
          <div className="flex-1 flex flex-col bg-[#111622]">
            {/* CHAT HEADER */}
            <div className="p-3.5 border-b border-[#1e293b] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveConv(null)}
                  className="md:hidden p-1 text-slate-400 hover:text-white"
                >
                  &larr;
                </button>
                <img
                  src={
                    activeConv.otherUser.avatarUrl ||
                    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'
                  }
                  alt={activeConv.otherUser.username}
                  className="w-9 h-9 rounded-full object-cover border border-slate-700 cursor-pointer"
                  onClick={() => onUserClick(activeConv.otherUser.username)}
                />
                <div>
                  <div
                    className="flex items-center gap-1.5 cursor-pointer"
                    onClick={() => onUserClick(activeConv.otherUser.username)}
                  >
                    <span className="font-semibold text-sm text-white hover:underline">
                      {activeConv.otherUser.username}
                    </span>
                    {activeConv.otherUser.isVerified && (
                      <CheckCircle className="w-3.5 h-3.5 text-sky-400" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">{activeConv.otherUser.displayName}</p>
                </div>
              </div>
            </div>

            {/* MESSAGES LIST */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-xs">
                  Say hello to start the conversation!
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.senderId === currentUser?.id;
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-xs sm:max-w-md px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          isMe
                            ? 'bg-sky-600 text-white rounded-tr-xs shadow-md shadow-sky-600/20'
                            : 'bg-slate-800 text-slate-200 rounded-tl-xs border border-slate-700/60'
                        }`}
                      >
                        {m.content}
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1 px-1">
                        {formatTimeAgo(m.createdAt)}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* MESSAGE COMPOSER */}
            {sendError && (
              <div className="px-3 py-1.5 bg-rose-500/20 text-rose-300 text-xs border-t border-rose-500/30 flex items-center justify-between">
                <span>{sendError}</span>
                <button onClick={() => setSendError(null)} className="text-slate-400 hover:text-white ml-2">×</button>
              </div>
            )}
            <form
              onSubmit={handleSendMessage}
              className="p-3 border-t border-[#1e293b] flex items-center gap-2 bg-[#0e131d]"
            >
              <input
                type="text"
                placeholder="Type a message..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={sending || !messageText.trim()}
                className="p-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white disabled:opacity-40 transition-colors shadow-sm"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center flex-col p-8 text-center text-slate-400">
            <MessageSquare className="w-12 h-12 text-slate-600 mb-3" />
            <h3 className="text-base font-bold text-white mb-1">Your Messages</h3>
            <p className="text-xs text-slate-500 max-w-xs">
              Send private direct messages, photo feedback, and project inquiries to other creators.
            </p>
          </div>
        )}
      </div>

      {/* NEW CHAT MODAL */}
      {showNewChatModal && (
        <div
          onClick={() => setShowNewChatModal(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#111622] border border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white">New Message</h3>
              <button
                onClick={() => setShowNewChatModal(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-slate-800">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 absolute left-3 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search creators..."
                  value={searchUserQuery}
                  onChange={(e) => setSearchUserQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  autoFocus
                />
              </div>
            </div>

            <div className="p-2 overflow-y-auto flex-1 space-y-1">
              {userSearchResults.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  {searchUserQuery.trim() ? 'No users found.' : 'Search for a username above.'}
                </div>
              ) : (
                userSearchResults.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => handleStartChatWith(u)}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-800/60 cursor-pointer"
                  >
                    <img
                      src={u.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
                      alt={u.username}
                      className="w-9 h-9 rounded-full object-cover"
                    />
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-xs text-white">{u.username}</span>
                        {u.isVerified && <CheckCircle className="w-3 h-3 text-sky-400" />}
                      </div>
                      <p className="text-[11px] text-slate-400">{u.displayName}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
