import React, { useState, useEffect, useCallback } from 'react';
import { Navigation } from './components/Navigation';
import { Feed } from './components/Feed';
import { Explore } from './components/Explore';
import { ProfileView } from './components/ProfileView';
import { DirectMessages } from './components/DirectMessages';
import { NotificationsModal } from './components/NotificationsModal';
import { PostDetailModal } from './components/PostDetailModal';
import { CreatePostModal } from './components/CreatePostModal';
import { SettingsModal } from './components/SettingsModal';
import { MailboxViewer } from './components/MailboxViewer';
import { ReportModal } from './components/ReportModal';
import { AuthModal } from './components/AuthModal';
import { User, Post } from './types';
import { apiFetch, logoutSession } from './api';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // Active navigation view
  const [currentTab, setCurrentTab] = useState<string>('feed');
  const [activeProfileUsername, setActiveProfileUsername] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string>('');

  // Modals state
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isMailboxModalOpen, setIsMailboxModalOpen] = useState(false);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  const [reportModalData, setReportModalData] = useState<{
    targetId: string;
    targetType: 'post' | 'user' | 'comment' | 'message';
  } | null>(null);

  const [resetTokenForModal, setResetTokenForModal] = useState<string | null>(null);
  const [targetMessageUserId, setTargetMessageUserId] = useState<string | null>(null);

  // Data state
  const [feedPosts, setFeedPosts] = useState<Post[]>([]);
  const [creators, setCreators] = useState<any[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [outboxCount, setOutboxCount] = useState(0);

  // Check Current User on mount
  const checkAuth = useCallback(async () => {
    const { data } = await apiFetch('/api/auth/me');
    if (data?.user) {
      setCurrentUser(data.user);
    } else {
      setCurrentUser(null);
    }
    setAuthChecking(false);
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Load Unread Counts and dev outbox count
  const loadCounts = useCallback(async () => {
    if (currentUser) {
      const { data } = await apiFetch('/api/notifications/unread-count');
      if (data) {
        setUnreadNotifications(data.notificationsCount || 0);
        setUnreadMessages(data.messagesCount || 0);
      }
    }
    const { data: devData } = await apiFetch('/api/dev/emails');
    if (devData?.emails) {
      setOutboxCount(devData.emails.length);
    }
  }, [currentUser]);

  useEffect(() => {
    loadCounts();
    const interval = setInterval(loadCounts, 8000);
    return () => clearInterval(interval);
  }, [loadCounts]);

  // Load Feed posts
  const loadFeed = useCallback(async () => {
    if (currentUser) {
      const { data } = await apiFetch('/api/posts/feed');
      if (data?.posts && data.posts.length > 0) {
        setFeedPosts(data.posts);
      } else {
        // Fallback to explore so feed is never completely blank
        const exploreRes = await apiFetch('/api/posts/explore');
        if (exploreRes.data?.posts) {
          setFeedPosts(exploreRes.data.posts);
        }
      }
    } else {
      const exploreRes = await apiFetch('/api/posts/explore');
      if (exploreRes.data?.posts) {
        setFeedPosts(exploreRes.data.posts);
      }
    }
  }, [currentUser]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  // Load sample creators for stories strip
  useEffect(() => {
    async function loadCreators() {
      const { data } = await apiFetch('/api/users/search?q=');
      if (data?.users) {
        setCreators(data.users.slice(0, 8));
      }
    }
    loadCreators();
  }, []);

  // Handle Like Toggle
  const handleLikeToggle = async (postId: string) => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }

    // Optimistic update
    setFeedPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          const nextLiked = !p.isLiked;
          return {
            ...p,
            isLiked: nextLiked,
            likesCount: nextLiked ? p.likesCount + 1 : Math.max(0, p.likesCount - 1),
          };
        }
        return p;
      })
    );

    if (selectedPost && selectedPost.id === postId) {
      const nextLiked = !selectedPost.isLiked;
      setSelectedPost({
        ...selectedPost,
        isLiked: nextLiked,
        likesCount: nextLiked
          ? selectedPost.likesCount + 1
          : Math.max(0, selectedPost.likesCount - 1),
      });
    }

    await apiFetch(`/api/engagement/like/${postId}`, { method: 'POST' });
  };

  // Handle Save / Bookmark Toggle
  const handleSaveToggle = async (postId: string) => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }

    setFeedPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, isSaved: !p.isSaved } : p))
    );

    if (selectedPost && selectedPost.id === postId) {
      setSelectedPost({ ...selectedPost, isSaved: !selectedPost.isSaved });
    }

    await apiFetch(`/api/engagement/save/${postId}`, { method: 'POST' });
  };

  const handleUserClick = (username: string) => {
    setActiveProfileUsername(username);
    setCurrentTab('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTagClick = (tag: string) => {
    setActiveTag(tag);
    setCurrentTab('explore');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePostCreated = (newPost: Post) => {
    setFeedPosts((prev) => [newPost, ...prev]);
    setCurrentTab('feed');
  };

  const handlePostDeleted = (postId: string) => {
    setFeedPosts((prev) => prev.filter((p) => p.id !== postId));
    setSelectedPost(null);
  };

  const handleLogout = async () => {
    await logoutSession();
    setCurrentUser(null);
    setCurrentTab('explore');
    loadFeed();
  };

  const handleMessageUser = (userId: string) => {
    setTargetMessageUserId(userId);
    setCurrentTab('messages');
  };

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col md:flex-row">
      {/* NAVIGATION (DESKTOP SIDEBAR + MOBILE BOTTOM BAR) */}
      <Navigation
        currentTab={currentTab}
        setCurrentTab={(tab) => {
          if (tab === 'notifications') {
            setIsNotificationsModalOpen(true);
          } else {
            if (tab === 'profile') {
              setActiveProfileUsername(currentUser?.username || null);
            }
            setCurrentTab(tab);
          }
        }}
        currentUser={currentUser}
        unreadNotifications={unreadNotifications}
        unreadMessages={unreadMessages}
        openCreateModal={() => setIsCreateModalOpen(true)}
        openAuthModal={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
        openSettingsModal={() => setIsSettingsModalOpen(true)}
        openMailboxModal={() => setIsMailboxModalOpen(true)}
        outboxCount={outboxCount}
      />

      {/* MAIN VIEW AREA */}
      <main className="flex-1 md:ml-64 lg:ml-72 min-h-screen overflow-x-hidden">
        {/* TOP BANNER FOR UNVERIFIED USERS */}
        {currentUser && !currentUser.isVerified && (
          <div
            id="verification-prompt-banner"
            className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-b border-amber-500/30 px-4 py-2.5 flex items-center justify-between text-xs text-amber-200"
          >
            <span>
              <strong>Action required:</strong> Verify your email address ({currentUser.email}) to unlock post creation and community messaging.
            </span>
            <button
              onClick={() => setIsMailboxModalOpen(true)}
              className="font-bold underline text-amber-300 hover:text-white ml-2"
            >
              Open Email Outbox
            </button>
          </div>
        )}

        {/* FEED VIEW */}
        {currentTab === 'feed' && (
          <Feed
            posts={feedPosts}
            currentUser={currentUser}
            onPostClick={(post) => setSelectedPost(post)}
            onUserClick={handleUserClick}
            onTagClick={handleTagClick}
            onLikeToggle={handleLikeToggle}
            onSaveToggle={handleSaveToggle}
            onCommentAdded={(postId, newComment) => {
              setFeedPosts((prev) =>
                prev.map((p) =>
                  p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p
                )
              );
            }}
            onReportClick={(postId) =>
              setReportModalData({ targetId: postId, targetType: 'post' })
            }
            onExploreClick={() => setCurrentTab('explore')}
            creators={creators}
          />
        )}

        {/* EXPLORE VIEW */}
        {currentTab === 'explore' && (
          <Explore
            onPostClick={(post) => setSelectedPost(post)}
            onUserClick={handleUserClick}
            activeTag={activeTag}
            setActiveTag={setActiveTag}
          />
        )}

        {/* PROFILE VIEW */}
        {currentTab === 'profile' && (
          <ProfileView
            username={activeProfileUsername || currentUser?.username || 'elena_lens'}
            currentUser={currentUser}
            onPostClick={(post) => setSelectedPost(post)}
            openSettingsModal={() => setIsSettingsModalOpen(true)}
            onMessageUser={handleMessageUser}
            onReportClick={(userId) =>
              setReportModalData({ targetId: userId, targetType: 'user' })
            }
          />
        )}

        {/* DIRECT MESSAGES VIEW */}
        {currentTab === 'messages' && (
          <DirectMessages
            currentUser={currentUser}
            targetUserId={targetMessageUserId}
            onClearTargetUser={() => setTargetMessageUserId(null)}
            onUserClick={handleUserClick}
          />
        )}
      </main>

      {/* POST DETAIL MODAL */}
      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          currentUser={currentUser}
          onClose={() => setSelectedPost(null)}
          onUserClick={handleUserClick}
          onLikeToggle={handleLikeToggle}
          onSaveToggle={handleSaveToggle}
          onPostDeleted={handlePostDeleted}
          onReportClick={(postId) =>
            setReportModalData({ targetId: postId, targetType: 'post' })
          }
        />
      )}

      {/* CREATE POST MODAL */}
      {isCreateModalOpen && (
        <CreatePostModal
          currentUser={currentUser}
          onClose={() => setIsCreateModalOpen(false)}
          onPostCreated={handlePostCreated}
          openMailboxModal={() => setIsMailboxModalOpen(true)}
        />
      )}

      {/* ACTIVITY NOTIFICATIONS MODAL */}
      {isNotificationsModalOpen && (
        <NotificationsModal
          onClose={() => setIsNotificationsModalOpen(false)}
          onUserClick={(uname) => {
            setIsNotificationsModalOpen(false);
            handleUserClick(uname);
          }}
          onPostClick={async (postId) => {
            setIsNotificationsModalOpen(false);
            const { data } = await apiFetch(`/api/posts/${postId}`);
            if (data?.post) setSelectedPost(data.post);
          }}
        />
      )}

      {/* AUTHENTICATION MODAL */}
      {isAuthModalOpen && (
        <AuthModal
          onClose={() => {
            setIsAuthModalOpen(false);
            setResetTokenForModal(null);
          }}
          resetToken={resetTokenForModal}
          onAuthSuccess={(user) => {
            setCurrentUser(user);
            setIsAuthModalOpen(false);
            loadFeed();
            loadCounts();
          }}
          openMailboxModal={() => setIsMailboxModalOpen(true)}
        />
      )}

      {/* SETTINGS MODAL */}
      {isSettingsModalOpen && (
        <SettingsModal
          currentUser={currentUser}
          onClose={() => setIsSettingsModalOpen(false)}
          onProfileUpdated={(updated) => {
            if (currentUser) setCurrentUser({ ...currentUser, ...updated });
          }}
          onAccountDeleted={() => {
            setCurrentUser(null);
            setIsSettingsModalOpen(false);
            setCurrentTab('explore');
            loadFeed();
          }}
          onLogout={handleLogout}
        />
      )}

      {/* MAILBOX / DEV OUTBOX MODAL */}
      {isMailboxModalOpen && (
        <MailboxViewer
          onClose={() => setIsMailboxModalOpen(false)}
          onEmailVerified={() => {
            if (currentUser) setCurrentUser({ ...currentUser, isVerified: true });
            loadCounts();
          }}
          onOpenResetPasswordWithToken={(token) => {
            setResetTokenForModal(token);
            setIsAuthModalOpen(true);
          }}
        />
      )}

      {/* REPORT MODAL */}
      {reportModalData && (
        <ReportModal
          targetId={reportModalData.targetId}
          targetType={reportModalData.targetType}
          onClose={() => setReportModalData(null)}
        />
      )}

      {/* GUEST BOTTOM DOCK (INSTAGRAM STYLE) */}
      {!currentUser && !authChecking && (
        <aside
          id="guest-bottom-dock"
          aria-label="Guest sign in prompt"
          className="fixed bottom-0 inset-x-0 bg-slate-950/95 border-t border-slate-800 p-3 sm:px-8 z-30 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xl backdrop-blur-md"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-400 via-rose-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
              V
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-white">Experience Verve like Instagram</p>
              <p className="text-[11px] text-slate-400">Log in to like posts, comment, follow creators, and share moments.</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              id="guest-dock-login-btn"
              onClick={() => setIsAuthModalOpen(true)}
              className="flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#0095f6] hover:bg-[#1877f2] text-white transition-colors shadow"
            >
              Log In
            </button>
            <button
              id="guest-dock-signup-btn"
              onClick={() => setIsAuthModalOpen(true)}
              className="flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-semibold border border-slate-600 hover:border-slate-400 text-slate-200 hover:text-white transition-colors"
            >
              Sign Up
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
