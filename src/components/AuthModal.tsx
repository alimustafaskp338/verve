import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Smartphone,
  ShieldCheck,
  ArrowLeft,
  KeyRound,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
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
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'reset' | 'verify'>(
    resetToken ? 'reset' : initialMode
  );

  // Form states
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [tokenInput, setTokenInput] = useState(resetToken || '');

  // UI helpers
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Live validation states
  const [emailStatus, setEmailStatus] = useState<{
    checking: boolean;
    valid?: boolean;
    message?: string;
  }>({ checking: false });

  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean;
    available?: boolean;
    message?: string;
  }>({ checking: false });

  // Rotating phone screenshot for Instagram desktop mockup
  const [currentSlide, setCurrentSlide] = useState(0);
  const phoneScreenshots = [
    {
      image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&auto=format&fit=crop&q=80',
      user: 'elena_lens',
      caption: 'Alps morning light hitting the ridges 🏔️✨',
      likes: '1,420',
    },
    {
      image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&auto=format&fit=crop&q=80',
      user: 'sophia_atelier',
      caption: 'Studio portraits and warm analog tones 🎞️',
      likes: '2,890',
    },
    {
      image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop&q=80',
      user: 'marcus_urban',
      caption: 'Golden hour along the coast 🌅🌊',
      likes: '945',
    },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % phoneScreenshots.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [phoneScreenshots.length]);

  // Live Email Validation Debounce
  useEffect(() => {
    if (mode !== 'signup' || !email.trim()) {
      setEmailStatus({ checking: false });
      return;
    }

    if (email.length < 5 || !email.includes('@')) {
      setEmailStatus({ checking: false, valid: false, message: 'Enter a valid email address' });
      return;
    }

    setEmailStatus({ checking: true });
    const timer = setTimeout(async () => {
      const { data } = await apiFetch('/api/auth/validate-email', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      if (data) {
        setEmailStatus({
          checking: false,
          valid: data.isValid,
          message: data.error,
        });
      } else {
        setEmailStatus({ checking: false });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [email, mode]);

  // Live Username Availability Check Debounce
  useEffect(() => {
    if (mode !== 'signup' || !username.trim()) {
      setUsernameStatus({ checking: false });
      return;
    }

    if (username.length < 3) {
      setUsernameStatus({ checking: false, available: false, message: 'Min 3 characters' });
      return;
    }

    setUsernameStatus({ checking: true });
    const timer = setTimeout(async () => {
      const { data } = await apiFetch(`/api/auth/check-username?username=${encodeURIComponent(username)}`);
      if (data) {
        setUsernameStatus({
          checking: false,
          available: data.available,
          message: data.message || data.error,
        });
      } else {
        setUsernameStatus({ checking: false });
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [username, mode]);

  // Password strength calculation
  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return 0;
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return score; // 0 to 4
  };
  const passwordStrength = getPasswordStrength(password);

  // Quick Demo Login Handler
  const handleQuickDemoLogin = async (demoUsername: string, demoPass: string) => {
    setLoading(true);
    setError(null);
    setIdentifier(demoUsername);
    setPassword(demoPass);

    const { data, error: apiError } = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: demoUsername, password: demoPass }),
    });

    setLoading(false);
    if (data?.user) {
      if (data.token) {
        setAuthToken(data.token);
      }
      onAuthSuccess(data.user);
      onClose();
    } else {
      setError(apiError || 'Demo login failed.');
    }
  };

  // Standard Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) return;

    setLoading(true);
    setError(null);

    const { data, error: apiError } = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: identifier.trim(), password }),
    });

    setLoading(false);
    if (data?.user) {
      if (data.token) {
        setAuthToken(data.token);
      }
      onAuthSuccess(data.user);
      onClose();
    } else {
      setError(apiError || 'Invalid email, username, or password.');
    }
  };

  // Standard Signup
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (emailStatus.valid === false) {
      setError(emailStatus.message || 'Please provide a valid email address.');
      return;
    }

    if (usernameStatus.available === false) {
      setError(usernameStatus.message || 'Username is already taken.');
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: apiError } = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim(),
        username: username.trim().toLowerCase(),
        displayName: displayName.trim() || username.trim(),
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
          `Welcome to Verve! A confirmation email has been dispatched to ${data.emailDelivery.recipient}.`
        );
      } else {
        setSuccessNotice(
          `Welcome to Verve! Your verification code has been generated.`
        );
      }

      // Transition to verification code step or close
      setTimeout(() => {
        setMode('verify');
      }, 1200);
    } else {
      setError(apiError || 'Failed to create account.');
    }
  };

  // Verify Email with Token
  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode.trim()) return;

    setLoading(true);
    setError(null);

    const { data, error: apiError } = await apiFetch('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: verificationCode.trim() }),
    });

    setLoading(false);
    if (!apiError) {
      setSuccessNotice('Account successfully verified! You have full access.');
      setTimeout(() => {
        onClose();
      }, 1500);
    } else {
      setError(apiError);
    }
  };

  // Forgot Password
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);

    const { data, error: apiError } = await apiFetch('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim() }),
    });

    setLoading(false);
    if (!apiError) {
      setSuccessNotice(
        'If an account exists with that email, a password reset link has been dispatched.'
      );
    } else {
      setError(apiError);
    }
  };

  // Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: apiError } = await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token: tokenInput.trim(),
        newPassword: password,
      }),
    });

    setLoading(false);
    if (!apiError) {
      setSuccessNotice('Password successfully changed! Please log in.');
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
      className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl flex items-center justify-center my-auto relative"
      >
        {/* CLOSE BUTTON */}
        <button
          id="auth-modal-close-btn"
          onClick={onClose}
          className="absolute -top-12 right-0 sm:right-2 p-2 text-slate-400 hover:text-white rounded-full bg-slate-900/60 hover:bg-slate-800 transition-colors z-20"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-full flex items-center justify-center gap-8">
          {/* ========================================================
              LEFT COLUMN: INSTAGRAM SMARTPHONE SHOWCASE MOCKUP (DESKTOP)
             ======================================================== */}
          <div className="hidden lg:flex flex-col items-center justify-center relative w-[360px] select-none">
            {/* Phone Outer Shell */}
            <div className="w-[310px] h-[610px] bg-[#1a202c] rounded-[48px] p-3 shadow-2xl border-4 border-slate-700 relative overflow-hidden shadow-sky-500/10">
              {/* Dynamic Island / Speaker Notch */}
              <div className="absolute top-5 inset-x-0 mx-auto w-24 h-4 bg-black rounded-full z-30 flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-[#111625] mr-2" />
                <div className="w-1.5 h-1.5 rounded-full bg-blue-900" />
              </div>

              {/* Phone Inner Screen with Live Carousel */}
              <div className="w-full h-full bg-slate-950 rounded-[38px] overflow-hidden relative flex flex-col pt-7">
                {/* Simulated App Header */}
                <div className="px-4 py-2 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/90 backdrop-blur z-20">
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-md bg-gradient-to-tr from-amber-400 via-rose-500 to-indigo-600 flex items-center justify-center text-[9px] font-black text-white">
                      V
                    </div>
                    <span className="text-xs font-bold tracking-tight text-white font-serif">Verve</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] text-slate-400 font-medium">Explore</span>
                  </div>
                </div>

                {/* Carousel Image Display */}
                <div className="relative flex-1 bg-black overflow-hidden">
                  {phoneScreenshots.map((slide, idx) => (
                    <div
                      key={idx}
                      className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                        idx === currentSlide ? 'opacity-100' : 'opacity-0 pointer-events-none'
                      }`}
                    >
                      <img
                        src={slide.image}
                        alt="Instagram style preview"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 text-left">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-amber-400 to-rose-500 p-[1.5px]">
                            <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-[10px] text-white font-bold">
                              {slide.user[0].toUpperCase()}
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-white">@{slide.user}</span>
                        </div>
                        <p className="text-[11px] text-slate-200 line-clamp-2 leading-relaxed">
                          {slide.caption}
                        </p>
                        <p className="text-[10px] text-rose-400 font-bold mt-1">
                          ♥ {slide.likes} likes
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom App Navigation Bar */}
                <div className="h-10 bg-slate-950 border-t border-slate-850 flex items-center justify-around px-4 z-20">
                  <span className="w-4 h-4 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400 text-xs font-bold">●</span>
                  <span className="text-slate-600 text-xs">🔍</span>
                  <span className="text-slate-600 text-xs">➕</span>
                  <span className="text-slate-600 text-xs">♥</span>
                  <span className="w-3.5 h-3.5 rounded-full bg-slate-700" />
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================
              RIGHT COLUMN: INSTAGRAM-AUTHENTIC CARD STACK
             ======================================================== */}
          <div className="w-full max-w-[390px] flex flex-col gap-3">
            {/* MAIN AUTHENTICATION CARD */}
            <div className="bg-[#121721] sm:bg-[#0f141f] border border-slate-800/90 rounded-2xl sm:rounded-xl p-7 sm:p-9 text-center shadow-2xl relative">
              {/* INSTAGRAM STYLE LOGO & BRANDING */}
              <div className="mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 via-rose-500 to-indigo-600 mx-auto flex items-center justify-center shadow-lg shadow-rose-500/20 mb-3.5">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-white font-serif">
                  Verve
                </h1>
                {mode === 'signup' && (
                  <p className="text-xs font-medium text-slate-400 mt-2 px-2 leading-relaxed">
                    Sign up to see photos and videos from your friends.
                  </p>
                )}
                {mode === 'verify' && (
                  <p className="text-xs font-medium text-slate-400 mt-2 px-2 leading-relaxed">
                    Enter the confirmation code or token sent to your email.
                  </p>
                )}
              </div>

              {/* ERROR ALERT */}
              {error && (
                <div
                  id="auth-error-alert"
                  className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-lg flex items-start gap-2 text-left animate-in fade-in"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span className="leading-tight">{error}</span>
                </div>
              )}

              {/* SUCCESS NOTICE */}
              {successNotice && (
                <div
                  id="auth-success-alert"
                  className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-lg flex items-start gap-2 text-left animate-in fade-in"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  <span className="leading-tight">{successNotice}</span>
                </div>
              )}

              {/* ----------------------------------------------------
                  1. LOGIN VIEW
                 ---------------------------------------------------- */}
              {mode === 'login' && (
                <div>
                  <form onSubmit={handleLogin} className="space-y-2.5 text-left">
                    {/* Identifier Input */}
                    <div className="relative">
                      <input
                        id="login-identifier-input"
                        type="text"
                        placeholder="Phone number, username, or email"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        className="w-full bg-[#090d16] border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 transition-colors"
                        required
                        autoComplete="username"
                      />
                    </div>

                    {/* Password Input with Show/Hide Toggle */}
                    <div className="relative">
                      <input
                        id="login-password-input"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-[#090d16] border border-slate-700/80 rounded-lg px-3.5 py-2.5 pr-14 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 transition-colors"
                        required
                        autoComplete="current-password"
                      />
                      {password && (
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                        >
                          {showPassword ? 'Hide' : 'Show'}
                        </button>
                      )}
                    </div>

                    {/* Instagram Iconic Blue Button */}
                    <button
                      id="login-submit-btn"
                      type="submit"
                      disabled={loading || !identifier.trim() || !password}
                      className="w-full mt-2 py-2 px-4 rounded-lg font-semibold text-xs text-white bg-[#0095f6] hover:bg-[#1877f2] disabled:opacity-40 disabled:hover:bg-[#0095f6] transition-all shadow-md active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Logging in...</span>
                        </>
                      ) : (
                        <span>Log in</span>
                      )}
                    </button>
                  </form>

                  {/* INSTAGRAM "OR" DIVIDER */}
                  <div className="my-5 flex items-center gap-4">
                    <div className="flex-1 h-[1px] bg-slate-800" />
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                      OR
                    </span>
                    <div className="flex-1 h-[1px] bg-slate-800" />
                  </div>

                  {/* QUICK DEMO LOGIN BUTTONS */}
                  <div className="space-y-2">
                    <button
                      id="demo-login-elena-btn"
                      type="button"
                      onClick={() => handleQuickDemoLogin('elena_lens', 'Password123!')}
                      disabled={loading}
                      className="w-full py-2 px-3 rounded-lg border border-slate-700 bg-slate-850 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-amber-400 to-rose-500 flex items-center justify-center text-[9px] font-bold text-white">
                        E
                      </div>
                      <span>Log in as <strong>Elena Rostova (Demo)</strong></span>
                    </button>

                    <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
                      <span>Other demo creators:</span>
                      <button
                        type="button"
                        onClick={() => handleQuickDemoLogin('marcus_urban', 'Password123!')}
                        className="text-sky-400 hover:underline"
                      >
                        @marcus_urban
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => handleQuickDemoLogin('sophia_atelier', 'Password123!')}
                        className="text-sky-400 hover:underline"
                      >
                        @sophia_atelier
                      </button>
                    </div>
                  </div>

                  {/* FORGOT PASSWORD LINK */}
                  <div className="mt-5 text-center">
                    <button
                      id="login-forgot-password-link"
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setError(null);
                        setSuccessNotice(null);
                      }}
                      className="text-xs text-sky-400 hover:text-sky-300 transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>
              )}

              {/* ----------------------------------------------------
                  2. SIGNUP VIEW (INSTAGRAM STYLE)
                 ---------------------------------------------------- */}
              {mode === 'signup' && (
                <div>
                  <form onSubmit={handleSignup} className="space-y-2.5 text-left">
                    {/* Quick Demo Pre-fill */}
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={() => {
                          const rand = Math.floor(Math.random() * 8999) + 1000;
                          setEmail(`creator_${rand}@gmail.com`);
                          setUsername(`creator_${rand}`);
                          setDisplayName(`Verve Creator ${rand}`);
                          setPassword('VervePass123!');
                        }}
                        className="text-[11px] text-sky-400 hover:underline flex items-center gap-1 ml-auto"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Auto-fill valid test info</span>
                      </button>
                    </div>

                    {/* Email Input with Live Domain Validation */}
                    <div>
                      <div className="relative">
                        <input
                          id="signup-email-input"
                          type="email"
                          placeholder="Email address"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={`w-full bg-[#090d16] border rounded-lg px-3.5 py-2.5 pr-8 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                            emailStatus.valid === true
                              ? 'border-emerald-500/80 focus:border-emerald-500'
                              : emailStatus.valid === false
                              ? 'border-rose-500/80 focus:border-rose-500'
                              : 'border-slate-700/80 focus:border-slate-500'
                          }`}
                          required
                          autoComplete="email"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {emailStatus.checking && (
                            <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />
                          )}
                          {!emailStatus.checking && emailStatus.valid === true && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          )}
                          {!emailStatus.checking && emailStatus.valid === false && (
                            <AlertCircle className="w-4 h-4 text-rose-400" />
                          )}
                        </div>
                      </div>
                      {emailStatus.valid === false && emailStatus.message && (
                        <p className="text-[11px] text-rose-400 mt-1 pl-1">
                          {emailStatus.message}
                        </p>
                      )}
                    </div>

                    {/* Full Name / Display Name Input */}
                    <div>
                      <input
                        id="signup-fullname-input"
                        type="text"
                        placeholder="Full Name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full bg-[#090d16] border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-500 transition-colors"
                        required
                        autoComplete="name"
                      />
                    </div>

                    {/* Username Input with Live Availability Check */}
                    <div>
                      <div className="relative">
                        <input
                          id="signup-username-input"
                          type="text"
                          placeholder="Username (e.g. alex_photo)"
                          value={username}
                          onChange={(e) =>
                            setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                          }
                          className={`w-full bg-[#090d16] border rounded-lg px-3.5 py-2.5 pr-8 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                            usernameStatus.available === true
                              ? 'border-emerald-500/80 focus:border-emerald-500'
                              : usernameStatus.available === false
                              ? 'border-rose-500/80 focus:border-rose-500'
                              : 'border-slate-700/80 focus:border-slate-500'
                          }`}
                          required
                          autoComplete="username"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {usernameStatus.checking && (
                            <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />
                          )}
                          {!usernameStatus.checking && usernameStatus.available === true && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          )}
                          {!usernameStatus.checking && usernameStatus.available === false && (
                            <AlertCircle className="w-4 h-4 text-rose-400" />
                          )}
                        </div>
                      </div>
                      {usernameStatus.available === false && usernameStatus.message && (
                        <p className="text-[11px] text-rose-400 mt-1 pl-1">
                          {usernameStatus.message}
                        </p>
                      )}
                    </div>

                    {/* Password Input with Show/Hide & Strength Meter */}
                    <div>
                      <div className="relative">
                        <input
                          id="signup-password-input"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Password (min 8 characters)"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full bg-[#090d16] border border-slate-700/80 rounded-lg px-3.5 py-2.5 pr-14 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-500 transition-colors"
                          required
                          autoComplete="new-password"
                        />
                        {password && (
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                          >
                            {showPassword ? 'Hide' : 'Show'}
                          </button>
                        )}
                      </div>

                      {/* Password Strength Indicator */}
                      {password && (
                        <div className="mt-1.5 flex items-center gap-1.5 px-1">
                          <div className="flex gap-1 flex-1">
                            {[1, 2, 3, 4].map((step) => (
                              <div
                                key={step}
                                className={`h-1 flex-1 rounded-full transition-all ${
                                  passwordStrength >= step
                                    ? passwordStrength <= 2
                                      ? 'bg-rose-500'
                                      : passwordStrength === 3
                                      ? 'bg-amber-400'
                                      : 'bg-emerald-500'
                                    : 'bg-slate-800'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {passwordStrength <= 1
                              ? 'Weak'
                              : passwordStrength === 2
                              ? 'Fair'
                              : passwordStrength === 3
                              ? 'Good'
                              : 'Strong'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Instagram Policy Disclaimer */}
                    <p className="text-[10px] text-slate-400 leading-relaxed text-center pt-2">
                      People who use our service may have uploaded your contact information to Verve.{' '}
                      <span className="text-slate-300">Learn More</span>
                    </p>
                    <p className="text-[10px] text-slate-400 leading-relaxed text-center">
                      By signing up, you agree to our{' '}
                      <span className="text-slate-300 font-medium">Terms</span>,{' '}
                      <span className="text-slate-300 font-medium">Privacy Policy</span> and{' '}
                      <span className="text-slate-300 font-medium">Cookies Policy</span>.
                    </p>

                    {/* Instagram Blue Sign Up Button */}
                    <button
                      id="signup-submit-btn"
                      type="submit"
                      disabled={
                        loading ||
                        !email ||
                        !username ||
                        !password ||
                        emailStatus.valid === false ||
                        usernameStatus.available === false
                      }
                      className="w-full mt-2 py-2 px-4 rounded-lg font-semibold text-xs text-white bg-[#0095f6] hover:bg-[#1877f2] disabled:opacity-40 disabled:hover:bg-[#0095f6] transition-all shadow-md active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Creating account...</span>
                        </>
                      ) : (
                        <span>Sign up</span>
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* ----------------------------------------------------
                  3. EMAIL VERIFICATION STEP (INSTAGRAM STYLE)
                 ---------------------------------------------------- */}
              {mode === 'verify' && (
                <div>
                  <form onSubmit={handleVerifyEmail} className="space-y-3.5 text-left">
                    <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl text-xs text-sky-200 flex items-start gap-2.5">
                      <Mail className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-white">Confirmation Sent</p>
                        <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                          We sent a verification security link and token to your email address. You can paste the code below or click the link in your email.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Security Code / Verification Token
                      </label>
                      <input
                        id="verification-token-input"
                        type="text"
                        placeholder="Paste verification token here"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        className="w-full bg-[#090d16] border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-xs font-mono text-amber-300 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                        required
                      />
                    </div>

                    <button
                      id="verify-token-submit-btn"
                      type="submit"
                      disabled={loading || !verificationCode.trim()}
                      className="w-full py-2 px-4 rounded-lg font-semibold text-xs text-white bg-[#0095f6] hover:bg-[#1877f2] disabled:opacity-40 transition-all shadow-md flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Confirming...</span>
                        </>
                      ) : (
                        <span>Confirm Email</span>
                      )}
                    </button>

                    <div className="pt-2 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          openMailboxModal();
                        }}
                        className="text-amber-400 hover:underline flex items-center gap-1"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Open Dev Outbox</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMode('login')}
                        className="text-slate-400 hover:text-white"
                      >
                        Back to Log In
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* ----------------------------------------------------
                  4. FORGOT PASSWORD (INSTAGRAM STYLE)
                 ---------------------------------------------------- */}
              {mode === 'forgot' && (
                <div>
                  <div className="w-14 h-14 rounded-full border-2 border-slate-600 mx-auto mb-3 flex items-center justify-center">
                    <Lock className="w-7 h-7 text-slate-300" />
                  </div>
                  <h3 className="font-bold text-sm text-white mb-1">Trouble logging in?</h3>
                  <p className="text-xs text-slate-400 mb-4 px-2 leading-relaxed">
                    Enter your email, phone, or username and we'll send you a link or token to get back into your account.
                  </p>

                  <form onSubmit={handleForgotPassword} className="space-y-3 text-left">
                    <input
                      id="forgot-email-input"
                      type="email"
                      placeholder="Email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-[#090d16] border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-500"
                      required
                    />

                    <button
                      id="forgot-submit-btn"
                      type="submit"
                      disabled={loading || !email.trim()}
                      className="w-full py-2 px-4 rounded-lg font-semibold text-xs text-white bg-[#0095f6] hover:bg-[#1877f2] disabled:opacity-40 transition-all shadow-md flex items-center justify-center gap-2"
                    >
                      {loading ? 'Sending...' : 'Send login link'}
                    </button>

                    <div className="my-4 flex items-center gap-4">
                      <div className="flex-1 h-[1px] bg-slate-800" />
                      <span className="text-[11px] font-bold text-slate-500 uppercase">OR</span>
                      <div className="flex-1 h-[1px] bg-slate-800" />
                    </div>

                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setMode('signup');
                          setError(null);
                        }}
                        className="text-xs font-bold text-slate-200 hover:text-white"
                      >
                        Create new account
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* ----------------------------------------------------
                  5. RESET PASSWORD (WITH TOKEN)
                 ---------------------------------------------------- */}
              {mode === 'reset' && (
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 mx-auto mb-3 flex items-center justify-center">
                    <KeyRound className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-sm text-white mb-1">Set New Password</h3>
                  <p className="text-xs text-slate-400 mb-4">
                    Choose a strong password with at least 8 characters.
                  </p>

                  <form onSubmit={handleResetPassword} className="space-y-3 text-left">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Reset Token
                      </label>
                      <input
                        type="text"
                        placeholder="Paste reset token"
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        className="w-full bg-[#090d16] border border-slate-700/80 rounded-lg px-3.5 py-2 text-xs font-mono text-amber-300 focus:outline-none"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        New Password
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="New password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-[#090d16] border border-slate-700/80 rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Confirm password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-[#090d16] border border-slate-700/80 rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !tokenInput || !password}
                      className="w-full py-2 px-4 rounded-lg font-semibold text-xs text-white bg-[#0095f6] hover:bg-[#1877f2] disabled:opacity-40 transition-all shadow-md"
                    >
                      {loading ? 'Updating...' : 'Reset Password'}
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* SECONDARY CARD: SWITCH BETWEEN LOGIN & SIGNUP (INSTAGRAM STYLE) */}
            <div className="bg-[#121721] sm:bg-[#0f141f] border border-slate-800/90 rounded-xl p-4 text-center text-xs">
              {mode === 'login' && (
                <p className="text-slate-300">
                  Don't have an account?{' '}
                  <button
                    id="switch-to-signup-btn"
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setError(null);
                      setSuccessNotice(null);
                    }}
                    className="font-semibold text-[#0095f6] hover:text-[#1877f2] ml-1 transition-colors"
                  >
                    Sign up
                  </button>
                </p>
              )}

              {mode === 'signup' && (
                <p className="text-slate-300">
                  Have an account?{' '}
                  <button
                    id="switch-to-login-btn"
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError(null);
                      setSuccessNotice(null);
                    }}
                    className="font-semibold text-[#0095f6] hover:text-[#1877f2] ml-1 transition-colors"
                  >
                    Log in
                  </button>
                </p>
              )}

              {(mode === 'forgot' || mode === 'reset' || mode === 'verify') && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                    setSuccessNotice(null);
                  }}
                  className="font-semibold text-[#0095f6] hover:text-[#1877f2] flex items-center justify-center gap-1.5 mx-auto transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to log in</span>
                </button>
              )}
            </div>

            {/* GET THE APP BADGE (INSTAGRAM AESTHETIC) */}
            <div className="text-center pt-2">
              <p className="text-[11px] text-slate-400 mb-2.5">Get the app.</p>
              <div className="flex items-center justify-center gap-2">
                <div className="h-9 px-3.5 bg-slate-900 border border-slate-700/80 rounded-lg flex items-center gap-2 text-slate-300 cursor-pointer hover:border-slate-500 transition-colors">
                  <span className="text-[10px] font-medium leading-none">
                    Download on the<br /><strong className="text-xs text-white">App Store</strong>
                  </span>
                </div>
                <div className="h-9 px-3.5 bg-slate-900 border border-slate-700/80 rounded-lg flex items-center gap-2 text-slate-300 cursor-pointer hover:border-slate-500 transition-colors">
                  <span className="text-[10px] font-medium leading-none">
                    GET IT ON<br /><strong className="text-xs text-white">Google Play</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
