import React, { useState, useEffect } from 'react';
import {
  X,
  User as UserIcon,
  Shield,
  Ban,
  Trash2,
  Lock,
  Globe,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { User, UserSummary } from '../types';
import { apiFetch } from '../api';

interface SettingsModalProps {
  currentUser: User | null;
  onClose: () => void;
  onProfileUpdated: (updatedUser: Partial<User>) => void;
  onAccountDeleted: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  currentUser,
  onClose,
  onProfileUpdated,
  onAccountDeleted,
}) => {
  if (!currentUser) return null;

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'privacy' | 'danger'>('profile');

  // Edit profile state
  const [displayName, setDisplayName] = useState(currentUser.displayName || '');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [website, setWebsite] = useState(currentUser.website || '');
  const [isPrivate, setIsPrivate] = useState(currentUser.isPrivate || false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Change password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Blocked users
  const [blockedUsers, setBlockedUsers] = useState<UserSummary[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);

  // Delete account state
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Fetch blocked users when privacy tab opened
  useEffect(() => {
    if (activeTab === 'privacy') {
      setLoadingBlocked(true);
      apiFetch('/api/social/blocked').then(({ data }) => {
        setLoadingBlocked(false);
        if (data?.blockedUsers) {
          setBlockedUsers(data.blockedUsers);
        }
      });
    }
  }, [activeTab]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSuccess(null);

    const { data, error } = await apiFetch('/api/users/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        displayName,
        bio,
        website,
        isPrivate,
      }),
    });

    setSavingProfile(false);
    if (data?.user) {
      onProfileUpdated(data.user);
      setProfileSuccess('Profile updated successfully.');
      setProfileError(null);
    } else {
      setProfileError(error || 'Failed to update profile.');
      setProfileSuccess(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setSavingPassword(true);
    setPasswordMessage(null);

    const { error } = await apiFetch('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    });

    setSavingPassword(false);
    if (!error) {
      setPasswordMessage({ type: 'success', text: 'Password changed successfully.' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPasswordMessage({ type: 'error', text: error });
    }
  };

  const handleUnblock = async (userId: string) => {
    const { error } = await apiFetch(`/api/social/unblock/${userId}`, { method: 'POST' });
    if (!error) {
      setBlockedUsers((prev) => prev.filter((u) => u.id !== userId));
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm('Are you ABSOLUTELY certain? This will delete all your posts, photos, and messages permanently.')) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    const { error } = await apiFetch('/api/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ password: deletePassword }),
    });

    setDeleting(false);
    if (!error) {
      onAccountDeleted();
    } else {
      setDeleteError(error);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#111622] border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col md:flex-row overflow-hidden shadow-2xl"
      >
        {/* SIDEBAR TABS */}
        <div className="w-full md:w-52 border-b md:border-b-0 md:border-r border-slate-800 p-3 space-y-1 bg-[#0e131d]">
          <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            Settings
          </div>
          <button
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'profile'
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            <span>Edit Profile</span>
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'security'
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Security & Password</span>
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'privacy'
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <Ban className="w-4 h-4" />
            <span>Blocked Users</span>
          </button>
          <button
            onClick={() => setActiveTab('danger')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'danger'
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                : 'text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            <span>Danger Zone</span>
          </button>
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 flex flex-col overflow-y-auto p-5 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white rounded"
          >
            <X className="w-5 h-5" />
          </button>

          {/* TAB 1: PROFILE */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <h3 className="font-bold text-base text-white">Edit Profile</h3>
              {profileSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{profileSuccess}</span>
                </div>
              )}
              {profileError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-xl flex items-center gap-2">
                  <X className="w-4 h-4 shrink-0" />
                  <span>{profileError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500 resize-none h-20"
                  maxLength={150}
                />
                <span className="text-[10px] text-slate-500 block text-right">{bio.length}/150</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Website</label>
                <input
                  type="url"
                  placeholder="https://yourportfolio.com"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-800">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-500 focus:ring-sky-400 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <span className="text-sm font-semibold text-white block">Private Account</span>
                    <span className="text-xs text-slate-400">
                      When your account is private, only people you approve can see your photos and videos.
                    </span>
                  </div>
                </label>
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-white disabled:opacity-50"
              >
                {savingProfile ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          )}

          {/* TAB 2: SECURITY */}
          {activeTab === 'security' && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <h3 className="font-bold text-base text-white">Change Password</h3>

              {passwordMessage && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    passwordMessage.type === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                      : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                  }`}
                >
                  <span>{passwordMessage.text}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  New Password (min 8 chars, 1 uppercase, 1 digit)
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={savingPassword}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-white disabled:opacity-50"
              >
                {savingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}

          {/* TAB 3: PRIVACY / BLOCKED */}
          {activeTab === 'privacy' && (
            <div className="space-y-4">
              <h3 className="font-bold text-base text-white">Blocked Accounts</h3>
              <p className="text-xs text-slate-400">
                Blocked people cannot find your profile, view your posts, or send you direct messages.
              </p>

              {loadingBlocked ? (
                <div className="py-8 text-center text-xs text-slate-500">Loading blocked users...</div>
              ) : blockedUsers.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  You have not blocked any accounts.
                </div>
              ) : (
                <div className="space-y-2">
                  {blockedUsers.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={
                            u.avatarUrl ||
                            'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'
                          }
                          alt={u.username}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                        <div>
                          <span className="font-semibold text-xs text-white">{u.username}</span>
                          <p className="text-[10px] text-slate-500">{u.displayName}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleUnblock(u.id)}
                        className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: DANGER ZONE */}
          {activeTab === 'danger' && (
            <form onSubmit={handleDeleteAccount} className="space-y-4">
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <AlertTriangle className="w-5 h-5" />
                  <span>Permanently Delete Account</span>
                </div>
                <p className="text-xs leading-relaxed">
                  Deleting your account will immediately and permanently erase all your profile data, uploaded photos, likes, comments, and direct message history. This action cannot be undone.
                </p>
              </div>

              {deleteError && (
                <div className="p-3 bg-rose-500/20 text-rose-200 text-xs rounded-xl">
                  {deleteError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Enter your password to confirm deletion:
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="w-full bg-slate-900 border border-rose-900/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={deleting || !deletePassword}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50 transition-colors shadow-lg shadow-rose-600/20"
              >
                {deleting ? 'Deleting account...' : 'Permanently Delete My Account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
