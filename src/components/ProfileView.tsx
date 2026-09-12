import React, { useState, useEffect, useRef } from 'react';
import {
  Grid,
  Bookmark,
  Lock,
  CheckCircle,
  Globe,
  Camera,
  MessageSquare,
  UserPlus,
  UserCheck,
  Clock,
  Ban,
  Flag,
  X,
} from 'lucide-react';
import { User, UserProfile, Post } from '../types';
import { apiFetch } from '../api';

interface ProfileViewProps {
  username: string;
  currentUser: User | null;
  onPostClick: (post: Post) => void;
  openSettingsModal: () => void;
  onMessageUser: (userId: string) => void;
  onReportClick: (userId: string, targetType: 'user') => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  username,
  currentUser,
  onPostClick,
  openSettingsModal,
  onMessageUser,
  onReportClick,
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState<'posts' | 'saved'>('posts');
  const [accessible, setAccessible] = useState(true);
  const [isSelf, setIsSelf] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);

  // Modals for followers / following
  const [listModalType, setListModalType] = useState<'followers' | 'following' | null>(null);
  const [listModalUsers, setListModalUsers] = useState<any[]>([]);
  const [listModalLoading, setListModalLoading] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Load Profile and Posts
  useEffect(() => {
    let isMounted = true;
    async function fetchProfile() {
      setLoading(true);
      const { data, error } = await apiFetch(`/api/users/profile/${username}`);
      if (isMounted && data?.profile) {
        setProfile(data.profile);
        setAccessible(data.accessible);
        setIsSelf(data.isSelf);

        // If accessible, fetch posts
        if (data.accessible) {
          const postsRes = await apiFetch(`/api/posts/user/${username}`);
          if (postsRes.data?.posts) {
            setPosts(postsRes.data.posts);
          }
        }
      }
      if (isMounted) setLoading(false);
    }
    fetchProfile();
    return () => {
      isMounted = false;
    };
  }, [username]);

  // Load saved posts if own profile and tab selected
  useEffect(() => {
    if (isSelf && activeTab === 'saved') {
      apiFetch('/api/engagement/saved').then(({ data }) => {
        if (data?.posts) setSavedPosts(data.posts);
      });
    }
  }, [activeTab, isSelf]);

  // Load pending follow requests if self and private
  useEffect(() => {
    if (isSelf && profile?.isPrivate) {
      apiFetch('/api/social/requests').then(({ data }) => {
        if (data?.requests) setPendingRequests(data.requests);
      });
    }
  }, [isSelf, profile?.isPrivate]);

  const handleFollowToggle = async () => {
    if (!profile || followLoading) return;
    setFollowLoading(true);

    if (profile.followStatus === 'none') {
      const { data } = await apiFetch(`/api/social/follow/${profile.id}`, { method: 'POST' });
      if (data?.status) {
        setProfile({
          ...profile,
          followStatus: data.status,
          followersCount: data.status === 'accepted' ? profile.followersCount + 1 : profile.followersCount,
        });
      }
    } else {
      const { data } = await apiFetch(`/api/social/unfollow/${profile.id}`, { method: 'POST' });
      if (data) {
        setProfile({
          ...profile,
          followStatus: 'none',
          followersCount: Math.max(0, profile.followersCount - 1),
        });
      }
    }
    setFollowLoading(false);
  };

  const handleAvatarUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    const { data, error } = await apiFetch('/api/users/avatar', {
      method: 'POST',
      body: formData,
    });
    if (data?.avatarUrl && profile) {
      setProfile({ ...profile, avatarUrl: data.avatarUrl });
    } else if (error) {
      alert(error);
    }
  };

  const openListModal = async (type: 'followers' | 'following') => {
    if (!profile) return;
    setListModalType(type);
    setListModalLoading(true);
    const { data } = await apiFetch(`/api/social/${profile.id}/${type}`);
    setListModalLoading(false);
    if (data) {
      setListModalUsers(data[type] || []);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    await apiFetch(`/api/social/requests/${requestId}/approve`, { method: 'POST' });
    setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
    if (profile) setProfile({ ...profile, followersCount: profile.followersCount + 1 });
  };

  const handleRejectRequest = async (requestId: string) => {
    await apiFetch(`/api/social/requests/${requestId}/reject`, { method: 'POST' });
    setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
  };

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto py-12 px-4 animate-pulse space-y-6">
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-full bg-slate-800" />
          <div className="space-y-3 flex-1">
            <div className="h-6 bg-slate-800 rounded w-1/3" />
            <div className="h-4 bg-slate-800 rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p className="text-base font-semibold text-white">User not found</p>
        <p className="text-xs mt-1">This user may have deactivated their account or changed username.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto pb-24 pt-4 px-3 sm:px-6">
      {/* PENDING REQUESTS BANNER (IF PRIVATE ACCOUNT OWNER) */}
      {isSelf && pendingRequests.length > 0 && (
        <div className="mb-6 p-4 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-white">
          <h4 className="text-sm font-bold text-sky-400 mb-2">
            Follow Requests ({pendingRequests.length})
          </h4>
          <div className="space-y-2">
            {pendingRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60">
                <div className="flex items-center gap-2.5">
                  <img
                    src={req.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
                    alt={req.username}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                  <div>
                    <span className="font-semibold text-xs text-white">{req.username}</span>
                    <span className="text-[11px] text-slate-400 ml-1.5">wants to follow you</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApproveRequest(req.id)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-white"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => handleRejectRequest(req.id)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PROFILE HEADER */}
      <div className="bg-[#111622] border border-[#1e293b] rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* AVATAR */}
          <div className="relative group">
            <img
              src={profile.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200'}
              alt={profile.username}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-2 border-sky-500/30 shadow-lg"
            />
            {isSelf && (
              <button
                onClick={() => avatarInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                title="Change Avatar"
              >
                <Camera className="w-6 h-6" />
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleAvatarUpload(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
              </button>
            )}
          </div>

          {/* USER INFO & ACTIONS */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <h2 className="text-xl font-bold text-white">{profile.username}</h2>
                {profile.isVerified && <CheckCircle className="w-5 h-5 text-sky-400" />}
                {profile.isPrivate && <Lock className="w-4 h-4 text-slate-400" title="Private Account" />}
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex items-center justify-center gap-2">
                {isSelf ? (
                  <button
                    onClick={openSettingsModal}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-colors"
                  >
                    Edit Profile
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleFollowToggle}
                      disabled={followLoading}
                      className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                        profile.followStatus === 'accepted'
                          ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                          : profile.followStatus === 'pending'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-sky-500 hover:bg-sky-400 text-white shadow-sky-500/20'
                      }`}
                    >
                      {profile.followStatus === 'accepted' ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5 text-sky-400" />
                          <span>Following</span>
                        </>
                      ) : profile.followStatus === 'pending' ? (
                        <>
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>Requested</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Follow</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => onMessageUser(profile.id)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-colors flex items-center gap-1.5"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-slate-300" />
                      <span>Message</span>
                    </button>

                    <button
                      onClick={() => onReportClick(profile.id, 'user')}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                      title="Report User"
                    >
                      <Flag className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* STATS (POSTS, FOLLOWERS, FOLLOWING) */}
            <div className="flex items-center justify-center sm:justify-start gap-6 mb-4 text-sm">
              <div>
                <span className="font-bold text-white mr-1">{profile.postsCount}</span>
                <span className="text-slate-400">posts</span>
              </div>
              <button
                onClick={() => openListModal('followers')}
                className="hover:underline text-left cursor-pointer"
              >
                <span className="font-bold text-white mr-1">{profile.followersCount}</span>
                <span className="text-slate-400">followers</span>
              </button>
              <button
                onClick={() => openListModal('following')}
                className="hover:underline text-left cursor-pointer"
              >
                <span className="font-bold text-white mr-1">{profile.followingCount}</span>
                <span className="text-slate-400">following</span>
              </button>
            </div>

            {/* DISPLAY NAME & BIO */}
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white">{profile.displayName}</h3>
              {profile.bio && <p className="text-xs text-slate-300 whitespace-pre-line">{profile.bio}</p>}
              {profile.website && (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:underline pt-1"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{profile.website.replace(/^https?:\/\//, '')}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PROFILE TABS */}
      <div className="flex items-center justify-center border-b border-[#1e293b] mb-6">
        <button
          onClick={() => setActiveTab('posts')}
          className={`flex items-center gap-2 py-3 px-6 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
            activeTab === 'posts'
              ? 'border-sky-500 text-sky-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Grid className="w-4 h-4" />
          <span>Posts</span>
        </button>

        {isSelf && (
          <button
            onClick={() => setActiveTab('saved')}
            className={`flex items-center gap-2 py-3 px-6 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'saved'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span>Saved</span>
          </button>
        )}
      </div>

      {/* POSTS GRID OR PRIVATE LOCKED NOTICE */}
      {!accessible ? (
        <div className="text-center py-16 bg-[#111622] border border-[#1e293b] rounded-2xl p-8">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">This Account is Private</h3>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Follow this account to see their photos and updates.
          </p>
        </div>
      ) : activeTab === 'posts' ? (
        posts.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Grid className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-white">No Posts Yet</p>
            <p className="text-xs text-slate-500 mt-1">When posts are uploaded, they will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
            {posts.map((post) => (
              <div
                key={post.id}
                onClick={() => onPostClick(post)}
                className="group relative aspect-square bg-slate-900 rounded-lg overflow-hidden cursor-pointer shadow-sm"
              >
                <img
                  src={post.thumbnailUrl || post.imageUrl}
                  alt={post.caption || 'Post thumbnail'}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        )
      ) : (
        /* SAVED POSTS TAB */
        savedPosts.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Bookmark className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-white">No Saved Posts</p>
            <p className="text-xs text-slate-500 mt-1">Save photos you want to see again. Only you can see what you have saved.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
            {savedPosts.map((post) => (
              <div
                key={post.id}
                onClick={() => onPostClick(post)}
                className="group relative aspect-square bg-slate-900 rounded-lg overflow-hidden cursor-pointer shadow-sm"
              >
                <img
                  src={post.thumbnailUrl || post.imageUrl}
                  alt={post.caption || 'Saved post'}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        )
      )}

      {/* FOLLOWERS / FOLLOWING MODAL */}
      {listModalType && (
        <div
          onClick={() => setListModalType(null)}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#111622] border border-slate-800 rounded-2xl w-full max-w-sm max-h-[70vh] flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h3 className="font-bold text-sm text-white capitalize">{listModalType}</h3>
              <button
                onClick={() => setListModalType(null)}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 overflow-y-auto space-y-2 flex-1">
              {listModalLoading ? (
                <div className="text-center py-8 text-slate-500 text-xs">Loading...</div>
              ) : listModalUsers.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">No users found.</div>
              ) : (
                listModalUsers.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-800/50">
                    <img
                      src={u.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
                      alt={u.username}
                      className="w-9 h-9 rounded-full object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-xs text-white truncate">{u.username}</span>
                        {u.isVerified && <CheckCircle className="w-3 h-3 text-sky-400" />}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">{u.displayName}</p>
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
