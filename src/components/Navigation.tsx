import React from 'react';
import {
  Home,
  Compass,
  PlusSquare,
  MessageSquare,
  Heart,
  User as UserIcon,
  Settings,
  Mail,
  LogOut,
  LogIn,
  ShieldAlert,
} from 'lucide-react';
import { User } from '../types';

interface NavigationProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  currentUser: User | null;
  unreadNotifications: number;
  unreadMessages: number;
  openCreateModal: () => void;
  openAuthModal: () => void;
  onLogout: () => void;
  openSettingsModal: () => void;
  openMailboxModal: () => void;
  outboxCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  setCurrentTab,
  currentUser,
  unreadNotifications,
  unreadMessages,
  openCreateModal,
  openAuthModal,
  onLogout,
  openSettingsModal,
  openMailboxModal,
  outboxCount,
}) => {
  const navItems = [
    { id: 'feed', label: 'Feed', icon: Home, requiresAuth: true },
    { id: 'explore', label: 'Explore', icon: Compass, requiresAuth: false },
    {
      id: 'messages',
      label: 'Messages',
      icon: MessageSquare,
      requiresAuth: true,
      badge: unreadMessages,
    },
    {
      id: 'notifications',
      label: 'Activity',
      icon: Heart,
      requiresAuth: true,
      badge: unreadNotifications,
    },
  ];

  return (
    <>
      {/* DESKTOP SIDEBAR */}
      <aside
        id="desktop-sidebar"
        className="hidden md:flex md:w-64 lg:w-72 flex-col fixed inset-y-0 left-0 bg-[#0d121c] border-r border-[#1e293b] p-5 z-30 select-none"
      >
        {/* LOGO */}
        <div
          id="brand-logo"
          onClick={() => setCurrentTab('feed')}
          className="flex items-center gap-3 px-2 py-4 mb-6 cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-rose-400 flex items-center justify-center shadow-lg shadow-sky-500/20 group-hover:scale-105 transition-transform duration-200">
            <span className="text-white font-black text-lg tracking-wider">V</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white group-hover:text-sky-400 transition-colors">
              VERVE
            </h1>
            <p className="text-[11px] font-medium tracking-wide text-slate-400 uppercase">Visual Social</p>
          </div>
        </div>

        {/* PRIMARY NAV LINKS */}
        <nav className="flex-1 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-link-${item.id}`}
                onClick={() => {
                  if (item.requiresAuth && !currentUser) {
                    openAuthModal();
                  } else {
                    setCurrentTab(item.id);
                  }
                }}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl font-medium text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-sky-500/10 text-sky-400 font-semibold border border-sky-500/20 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <Icon className={`w-5 h-5 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {Boolean(item.badge && item.badge > 0) && (
                  <span className="px-2 py-0.5 text-[11px] font-bold bg-rose-500 text-white rounded-full shadow-sm shadow-rose-500/40 animate-pulse">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* CREATE POST BUTTON */}
          <button
            id="nav-btn-create-post"
            onClick={() => {
              if (!currentUser) openAuthModal();
              else openCreateModal();
            }}
            className="w-full mt-3 flex items-center gap-3.5 px-3.5 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-lg shadow-sky-500/20 active:scale-[0.98] transition-all"
          >
            <PlusSquare className="w-5 h-5" />
            <span>Create Post</span>
          </button>

          {/* MY PROFILE (IF LOGGED IN) */}
          {currentUser && (
            <button
              id="nav-link-profile"
              onClick={() => setCurrentTab('profile')}
              className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl font-medium text-sm transition-all duration-150 ${
                currentTab === 'profile'
                  ? 'bg-sky-500/10 text-sky-400 font-semibold border border-sky-500/20 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.username}
                  className="w-5 h-5 rounded-full object-cover border border-slate-700"
                />
              ) : (
                <UserIcon className="w-5 h-5 text-slate-400" />
              )}
              <span className="truncate">Profile ({currentUser.username})</span>
            </button>
          )}

          {/* TRANSACTIONAL MAILBOX INSPECTOR (DEV & VERIFICATION FLOW) */}
          <button
            id="nav-link-mailbox"
            onClick={openMailboxModal}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs text-amber-300/90 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all mt-4"
            title="Inspect captured verification and password-reset emails"
          >
            <div className="flex items-center gap-2.5">
              <Mail className="w-4 h-4 text-amber-400" />
              <span>Email Outbox / Dev</span>
            </div>
            {outboxCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/30 text-amber-300 rounded border border-amber-500/40">
                {outboxCount}
              </span>
            )}
          </button>
        </nav>

        {/* BOTTOM CONTROLS */}
        <div className="pt-4 border-t border-[#1e293b] space-y-1">
          {currentUser ? (
            <>
              <button
                id="nav-btn-settings"
                onClick={openSettingsModal}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
              >
                <Settings className="w-4 h-4" />
                <span>Settings & Privacy</span>
              </button>
              <button
                id="nav-btn-logout"
                onClick={onLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </>
          ) : (
            <button
              id="nav-btn-login-sidebar"
              onClick={openAuthModal}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-700"
            >
              <LogIn className="w-4 h-4 text-sky-400" />
              <span>Log In / Sign Up</span>
            </button>
          )}
        </div>
      </aside>

      {/* MOBILE BOTTOM NAVIGATION */}
      <nav
        id="mobile-bottom-nav"
        className="md:hidden fixed bottom-0 inset-x-0 bg-[#0d121c]/95 backdrop-blur-md border-t border-[#1e293b] px-4 py-2 flex items-center justify-around z-40"
      >
        <button
          id="mob-nav-feed"
          onClick={() => setCurrentTab('feed')}
          className={`p-2 rounded-xl flex flex-col items-center gap-1 ${
            currentTab === 'feed' ? 'text-sky-400' : 'text-slate-400'
          }`}
        >
          <Home className="w-6 h-6" />
          <span className="text-[10px] font-medium">Home</span>
        </button>

        <button
          id="mob-nav-explore"
          onClick={() => setCurrentTab('explore')}
          className={`p-2 rounded-xl flex flex-col items-center gap-1 ${
            currentTab === 'explore' ? 'text-sky-400' : 'text-slate-400'
          }`}
        >
          <Compass className="w-6 h-6" />
          <span className="text-[10px] font-medium">Explore</span>
        </button>

        <button
          id="mob-nav-create"
          onClick={() => (currentUser ? openCreateModal() : openAuthModal())}
          className="p-2 -mt-5 bg-gradient-to-tr from-sky-500 to-indigo-600 text-white rounded-2xl shadow-lg shadow-sky-500/30 flex items-center justify-center"
        >
          <PlusSquare className="w-6 h-6" />
        </button>

        <button
          id="mob-nav-messages"
          onClick={() => (currentUser ? setCurrentTab('messages') : openAuthModal())}
          className={`relative p-2 rounded-xl flex flex-col items-center gap-1 ${
            currentTab === 'messages' ? 'text-sky-400' : 'text-slate-400'
          }`}
        >
          <MessageSquare className="w-6 h-6" />
          <span className="text-[10px] font-medium">Chat</span>
          {unreadMessages > 0 && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-[#0d121c]" />
          )}
        </button>

        <button
          id="mob-nav-profile"
          onClick={() => (currentUser ? setCurrentTab('profile') : openAuthModal())}
          className={`p-2 rounded-xl flex flex-col items-center gap-1 ${
            currentTab === 'profile' ? 'text-sky-400' : 'text-slate-400'
          }`}
        >
          {currentUser?.avatarUrl ? (
            <img
              src={currentUser.avatarUrl}
              alt="Me"
              className="w-6 h-6 rounded-full object-cover border border-sky-400"
            />
          ) : (
            <UserIcon className="w-6 h-6" />
          )}
          <span className="text-[10px] font-medium">Me</span>
        </button>
      </nav>
    </>
  );
};
