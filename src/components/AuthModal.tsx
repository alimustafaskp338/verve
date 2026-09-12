import React, { useState } from 'react';
import { X, LogIn, UserPlus, KeyRound, Mail, AlertCircle, CheckCircle, Sparkles } from 'lucide-react';
import { User } from '../types';
import { apiFetch, setAuthToken } from '../api';

interface AuthModalProps {
  initialMode?: 'login' | 'signup' | 'forgot';
  resetToken?: string | null;
  onClose: () => void;
  onAuthSuccess: (user: User) => void;
  openMailboxModal: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  initialMode = 'login',
  resetToken = null,
  onClose,
  onAuthSuccess,
  openMailboxModal,
}) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'reset'>(
    resetToken ? 'reset' : initialMode
  );

  // Form states
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tokenInput, setTokenInput] = useState(resetToken || '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: apiError } = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });

    setLoading(false);
    if (data?.user) {
      if (data.token) {
        setAuthToken(data.token);
      }
      onAuthSuccess(data.user);
      onClose();
    } else {
      setError(apiError || 'Failed to sign in.');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: apiError } = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        email,
        username,
        displayName: displayName || username,
        password,
      }),
    });

    setLoading(false);
    if (data?.user) {
      if (data.token) {
        setAuthToken(data.token);
      }
      onAuthSuccess(data.user);

      if (data.emailDelivery?.isSmtp) {
        setSuccessNotice(
          `Account created! A confirmation email has been dispatched directly to your Gmail (${data.emailDelivery.recipient}). Please check your inbox or spam folder.`
        );
      } else {
        setSuccessNotice(
          `Account created! Email verification link generated. You can click "Open Dev Outbox" below to verify immediately.`
        );
      }
      setTimeout(onClose, 3500);
    } else {
      setError(apiError || 'Failed to create account.');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: apiError } = await apiFetch('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });

    setLoading(false);
    if (!apiError) {
      setSuccessNotice(
        'Password reset email recorded! Click "Open Outbox" below to view the token.'
      );
    } else {
      setError(apiError);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: apiError } = await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token: tokenInput,
        newPassword: password,
      }),
    });

    setLoading(false);
    if (!apiError) {
      setSuccessNotice('Password successfully changed! Please log in with your new password.');
      setMode('login');
      setPassword('');
      setConfirmPassword('');
    } else {
      setError(apiError);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#111622] border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative"
      >
        {/* CLOSE BUTTON */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* HEADER BRANDING */}
        <div className="p-6 pb-2 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-rose-400 mx-auto flex items-center justify-center shadow-lg shadow-sky-500/20 mb-3">
            <span className="text-white font-black text-2xl">V</span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Welcome to Verve</h2>
          <p className="text-xs text-slate-400 mt-1">Authentic visual community for creators</p>
        </div>

        {/* TAB SWITCHER */}
        {mode !== 'reset' && (
          <div className="flex border-b border-slate-800 px-6 mt-2">
            <button
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-3 text-xs font-bold transition-colors border-b-2 ${
                mode === 'login'
                  ? 'border-sky-500 text-sky-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className={`flex-1 py-3 text-xs font-bold transition-colors border-b-2 ${
                mode === 'signup'
                  ? 'border-sky-500 text-sky-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        <div className="p-6 pt-4">
          {/* NOTICES */}
          {error && (
            <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successNotice && (
            <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{successNotice}</span>
            </div>
          )}

          {/* 1. LOGIN FORM */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Email or Username
                </label>
                <input
                  type="text"
                  placeholder="elena_lens or elena@verve.social"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setError(null);
                    }}
                    className="text-[11px] text-sky-400 hover:underline"
                  >
                    Forgot?
                  </button>
                </div>
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || !identifier || !password}
                className="w-full py-2.5 rounded-xl font-bold text-sm bg-sky-500 hover:bg-sky-400 text-white disabled:opacity-50 transition-all shadow-lg shadow-sky-500/20 mt-2"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              <div className="pt-2 text-center text-xs text-slate-400">
                <span>Try demo creators: </span>
                <code className="text-sky-300 font-mono">elena_lens</code> /{' '}
                <code className="text-slate-300 font-mono">Password123!</code>
              </div>
            </form>
          )}

          {/* 2. SIGNUP FORM */}
          {mode === 'signup' && (
            <form onSubmit={handleSignup} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Username</label>
                <input
                  type="text"
                  placeholder="unique_username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  placeholder="Your Full Name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Password (min 8 characters)
                </label>
                <input
                  type="password"
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || !email || !username || !password}
                className="w-full py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white disabled:opacity-50 transition-all shadow-lg shadow-sky-500/20 mt-2"
              >
                {loading ? 'Creating Account...' : 'Join Verve'}
              </button>
            </form>
          )}

          {/* 3. FORGOT PASSWORD */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="text-center">
                <KeyRound className="w-8 h-8 text-sky-400 mx-auto mb-2" />
                <h3 className="font-bold text-sm text-white">Reset Password</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Enter your email address and we'll send you a password reset link and token.
                </p>
              </div>

              <div>
                <input
                  type="email"
                  placeholder="Your account email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full py-2.5 rounded-xl font-bold text-sm bg-sky-500 hover:bg-sky-400 text-white disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <div className="flex items-center justify-between text-xs pt-2">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-slate-400 hover:text-white"
                >
                  &larr; Back to sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    openMailboxModal();
                  }}
                  className="text-amber-400 hover:underline flex items-center gap-1"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Open Outbox</span>
                </button>
              </div>
            </form>
          )}

          {/* 4. RESET PASSWORD WITH TOKEN */}
          {mode === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-3.5">
              <div className="text-center">
                <KeyRound className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                <h3 className="font-bold text-sm text-white">Set New Password</h3>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Reset Token</label>
                <input
                  type="text"
                  placeholder="Paste token from email outbox"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-amber-300 focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || !tokenInput || !password}
                className="w-full py-2.5 rounded-xl font-bold text-sm bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-50 transition-all font-bold mt-2"
              >
                {loading ? 'Resetting...' : 'Change Password'}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  &larr; Back to sign in
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
