import React, { useEffect, useState } from 'react';
import {
  Heart,
  MessageCircle,
  UserPlus,
  Check,
  X,
  Bell,
  CheckCircle,
} from 'lucide-react';
import { NotificationItem } from '../types';
import { apiFetch, formatTimeAgo } from '../api';

interface NotificationsModalProps {
  onClose: () => void;
  onUserClick: (username: string) => void;
  onPostClick: (postId: string) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  onClose,
  onUserClick,
  onPostClick,
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    setLoading(true);
    const { data } = await apiFetch('/api/notifications');
    if (data?.notifications) {
      setNotifications(data.notifications);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleMarkSingleRead = async (id: string) => {
    await apiFetch(`/api/notifications/read/${id}`, { method: 'POST' });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#111622] border border-slate-800 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* HEADER */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-sky-400" />
            <h3 className="font-bold text-base text-white">Activity</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-sky-400 hover:text-sky-300 font-semibold px-2 py-1 rounded"
            >
              Mark all read
            </button>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* LIST */}
        <div className="p-2 overflow-y-auto flex-1 space-y-1">
          {loading ? (
            <div className="text-center py-12 text-slate-500 text-xs">Loading activity...</div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-16 text-slate-500 space-y-2">
              <Heart className="w-10 h-10 mx-auto text-slate-700" />
              <p className="text-xs">No recent activity on your posts or profile.</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => {
                  if (!n.isRead) handleMarkSingleRead(n.id);
                  if (n.postId) onPostClick(n.postId);
                  else onUserClick(n.actor.username);
                }}
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                  n.isRead ? 'bg-transparent hover:bg-slate-800/40' : 'bg-sky-500/10 hover:bg-sky-500/15'
                }`}
              >
                {/* ICON TYPE */}
                <div className="relative shrink-0">
                  <img
                    src={
                      n.actor.avatarUrl ||
                      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'
                    }
                    alt={n.actor.username}
                    className="w-10 h-10 rounded-full object-cover border border-slate-700"
                  />
                  <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-[#111622] text-white">
                    {n.type === 'like' && <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />}
                    {n.type === 'comment' && (
                      <MessageCircle className="w-3 h-3 text-sky-400 fill-sky-400" />
                    )}
                    {n.type === 'follow' && <UserPlus className="w-3 h-3 text-indigo-400" />}
                    {n.type === 'follow_accept' && <Check className="w-3 h-3 text-emerald-400" />}
                  </div>
                </div>

                {/* TEXT */}
                <div className="flex-1 min-w-0 text-xs text-slate-300 leading-snug">
                  <span className="font-semibold text-white mr-1 hover:underline">
                    {n.actor.username}
                  </span>
                  {n.type === 'like' && 'liked your photo.'}
                  {n.type === 'comment' && 'commented on your photo.'}
                  {n.type === 'follow' && 'started following you.'}
                  {n.type === 'follow_request' && 'requested to follow you.'}
                  {n.type === 'follow_accept' && 'accepted your follow request.'}
                  {n.type === 'message' && 'sent you a direct message.'}
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {formatTimeAgo(n.createdAt)}
                  </div>
                </div>

                {/* POST THUMBNAIL IF PRESENT */}
                {n.postImageUrl && (
                  <img
                    src={n.postImageUrl}
                    alt="Thumbnail"
                    className="w-10 h-10 rounded-lg object-cover border border-slate-700 shrink-0"
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
