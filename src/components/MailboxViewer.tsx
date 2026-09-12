import React, { useEffect, useState } from 'react';
import { Mail, CheckCircle, Key, RefreshCw, X, ExternalLink, ShieldCheck } from 'lucide-react';
import { SentEmail } from '../types';
import { apiFetch, formatTimeAgo } from '../api';

interface MailboxViewerProps {
  onClose: () => void;
  onEmailVerified: () => void;
  onOpenResetPasswordWithToken: (token: string) => void;
}

export const MailboxViewer: React.FC<MailboxViewerProps> = ({
  onClose,
  onEmailVerified,
  onOpenResetPasswordWithToken,
}) => {
  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<SentEmail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchEmails = async () => {
    setLoading(true);
    setActionError(null);
    const { data } = await apiFetch('/api/dev/emails');
    if (data?.emails) {
      setEmails(data.emails);
      if (!selectedEmail && data.emails.length > 0) {
        setSelectedEmail(data.emails[0]);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  const handleVerifyAccount = async (token: string) => {
    setActionError(null);
    const { error } = await apiFetch('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    if (!error) {
      setActionSuccess('Email successfully verified! Account is now verified.');
      onEmailVerified();
    } else {
      setActionError(error);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#111622] border border-amber-500/30 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* HEADER */}
        <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Mail className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <span>Transactional Email Outbox</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  Real Dev Mode
                </span>
              </h3>
              <p className="text-[11px] text-amber-200/70">
                All verification and password reset emails are recorded here for testing without an external SMTP server.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchEmails}
              className="p-1.5 text-amber-300 hover:text-white rounded hover:bg-amber-500/20 transition-colors"
              title="Refresh Emails"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* NOTIFICATION BANNER */}
        {actionSuccess && (
          <div className="bg-emerald-500/20 border-b border-emerald-500/30 px-4 py-2.5 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}
        {actionError && (
          <div className="bg-rose-500/20 border-b border-rose-500/30 px-4 py-2.5 text-rose-300 text-xs flex items-center gap-2">
            <X className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* BODY (SPLIT VIEW) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* EMAIL LIST */}
          <div className="w-full md:w-80 border-r border-[#1e293b] overflow-y-auto p-2 space-y-1 bg-[#0e131d]">
            {loading && emails.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">Loading emails...</div>
            ) : emails.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">
                No emails sent yet. Sign up or request a password reset to see messages appear here!
              </div>
            ) : (
              emails.map((e) => {
                const isSelected = selectedEmail?.id === e.id;
                return (
                  <div
                    key={e.id}
                    onClick={() => setSelectedEmail(e)}
                    className={`p-3 rounded-xl cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-amber-500/20 border border-amber-500/30'
                        : 'hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                        {e.purpose.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-slate-500">{formatTimeAgo(e.sent_at)}</span>
                    </div>
                    <h4 className="font-semibold text-xs text-white truncate">{e.subject}</h4>
                    <p className="text-[11px] text-slate-400 truncate">To: {e.to_email}</p>
                  </div>
                );
              })
            )}
          </div>

          {/* EMAIL DETAIL & ACTION */}
          <div className="flex-1 flex flex-col overflow-y-auto p-5 bg-[#111622]">
            {selectedEmail ? (
              <div className="space-y-4">
                <div className="border-b border-slate-800 pb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400">Recipient:</span>
                    <span className="text-xs font-bold text-white">{selectedEmail.to_email}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs font-semibold text-slate-400">Subject:</span>
                    <span className="text-xs font-bold text-white">{selectedEmail.subject}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs font-semibold text-slate-400">Sent:</span>
                    <span className="text-xs text-slate-400">{selectedEmail.sent_at}</span>
                  </div>
                </div>

                {/* 1-CLICK ACTION BUTTON BASED ON PURPOSE */}
                {selectedEmail.token && (
                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-xs text-slate-300">
                      <p className="font-semibold text-white mb-0.5">Quick Action for Testing</p>
                      <p className="text-slate-400">
                        Execute the action associated with token{' '}
                        <code className="text-amber-300 text-[10px]">{selectedEmail.token.slice(0, 10)}...</code>
                      </p>
                    </div>

                    {selectedEmail.purpose === 'verification' || selectedEmail.purpose === 'email_verification' ? (
                      <button
                        onClick={() => handleVerifyAccount(selectedEmail.token)}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors shrink-0 shadow-lg shadow-emerald-600/20"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Verify This Account</span>
                      </button>
                    ) : selectedEmail.purpose === 'password_reset' ? (
                      <button
                        onClick={() => {
                          onOpenResetPasswordWithToken(selectedEmail.token);
                          onClose();
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-1.5 transition-colors shrink-0 shadow-lg shadow-amber-500/20"
                      >
                        <Key className="w-4 h-4" />
                        <span>Reset Password Now</span>
                      </button>
                    ) : null}
                  </div>
                )}

                {/* EMAIL CONTENT */}
                <div>
                  <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Message Body
                  </h5>
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                    {selectedEmail.text_content}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 text-slate-500 text-xs">Select an email to preview</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
