import React, { useState } from 'react';
import { Flag, X, CheckCircle, AlertCircle } from 'lucide-react';
import { apiFetch } from '../api';

interface ReportModalProps {
  targetId: string;
  targetType: 'post' | 'user' | 'comment' | 'message';
  onClose: () => void;
}

const REPORT_REASONS = [
  { id: 'spam', label: "It's spam or bot activity" },
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'inappropriate', label: 'Inappropriate or sexually explicit content' },
  { id: 'hate_speech', label: 'Hate speech or discrimination' },
  { id: 'misinformation', label: 'Misinformation or fraudulent scheme' },
  { id: 'copyright', label: 'Intellectual property / copyright violation' },
  { id: 'other', label: 'Something else' },
];

export const ReportModal: React.FC<ReportModalProps> = ({ targetId, targetType, onClose }) => {
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: apiError } = await apiFetch('/api/reports', {
      method: 'POST',
      body: JSON.stringify({
        targetType,
        targetId,
        reason,
        details,
      }),
    });

    setSubmitting(false);
    if (!apiError) {
      setSubmitted(true);
      setTimeout(onClose, 2000);
    } else {
      setError(apiError);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#111622] border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
      >
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-rose-400" />
            <h3 className="font-bold text-sm text-white capitalize">Report {targetType}</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
            <h4 className="text-base font-bold text-white">Report Submitted</h4>
            <p className="text-xs text-slate-400">
              Thank you for helping keep Verve safe and authentic. Our moderation team will review this report promptly.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Why are you reporting this?
              </label>
              <div className="space-y-2">
                {REPORT_REASONS.map((r) => (
                  <label
                    key={r.id}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer text-xs transition-colors ${
                      reason === r.id
                        ? 'bg-rose-500/10 border-rose-500/40 text-white font-medium'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reportReason"
                      value={r.id}
                      checked={reason === r.id}
                      onChange={() => setReason(r.id)}
                      className="text-rose-500 focus:ring-rose-400"
                    />
                    <span>{r.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Additional details (optional)
              </label>
              <textarea
                placeholder="Provide context for our review team..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 resize-none h-20"
                maxLength={500}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
