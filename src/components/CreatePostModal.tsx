import React, { useState, useRef } from 'react';
import { X, UploadCloud, Image as ImageIcon, MapPin, Sparkles, AlertCircle } from 'lucide-react';
import { User, Post } from '../types';
import { apiFetch } from '../api';

interface CreatePostModalProps {
  currentUser: User | null;
  onClose: () => void;
  onPostCreated: (post: Post) => void;
  openMailboxModal: () => void;
}

export const CreatePostModal: React.FC<CreatePostModalProps> = ({
  currentUser,
  onClose,
  onPostCreated,
  openMailboxModal,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [altText, setAltText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPEG, PNG, WEBP, or GIF).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image file must be under 5MB.');
      return;
    }
    setError(null);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select an image to share.');
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('image', selectedFile);
    formData.append('caption', caption);
    formData.append('location', location);
    formData.append('altText', altText);

    const { data, error: apiError } = await apiFetch('/api/posts', {
      method: 'POST',
      body: formData,
    });

    setLoading(false);

    if (data?.post) {
      onPostCreated(data.post);
      onClose();
    } else {
      setError(apiError || 'Failed to publish post.');
    }
  };

  return (
    <div
      id="create-post-modal-backdrop"
      onClick={onClose}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in"
    >
      <div
        id="create-post-modal-card"
        onClick={(e) => e.stopPropagation()}
        className="bg-[#111622] border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative"
      >
        {/* HEADER */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-bold text-white">Create New Post</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* VERIFICATION WARNING IF UNVERIFIED */}
        {currentUser && !currentUser.isVerified && (
          <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Email verification is required before publishing posts.</span>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                openMailboxModal();
              }}
              className="underline font-semibold hover:text-amber-100"
            >
              Open Outbox
            </button>
          </div>
        )}

        {/* FORM */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* DROPZONE / IMAGE PREVIEW */}
          {!previewUrl ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors flex flex-col items-center justify-center min-h-[220px] ${
                dragActive
                  ? 'border-sky-500 bg-sky-500/5'
                  : 'border-slate-700 hover:border-slate-500 bg-slate-900/40'
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-sky-500/10 text-sky-400 flex items-center justify-center mb-3">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-white mb-1">
                Drag and drop your photo here, or click to browse
              </p>
              <p className="text-xs text-slate-400">Supports JPEG, PNG, WEBP, GIF up to 5MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFile(e.target.files[0]);
                  }
                }}
                className="hidden"
              />
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden bg-black max-h-[300px] flex items-center justify-center group">
              <img src={previewUrl} alt="Preview" className="max-h-[300px] object-contain w-full" />
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                }}
                className="absolute top-3 right-3 p-1.5 bg-black/70 hover:bg-black text-white rounded-full transition-colors"
                title="Change Photo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* CAPTION */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Caption & Hashtags
            </label>
            <textarea
              placeholder="Write a caption... e.g. Golden hour geometry #architecture #minimalism"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 resize-none h-24"
              maxLength={2200}
            />
            <div className="flex justify-between text-[11px] text-slate-500 mt-1">
              <span>Include #tags for discovery</span>
              <span>{caption.length} / 2200</span>
            </div>
          </div>

          {/* LOCATION & ACCESSIBILITY ALT TEXT */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Location (Optional)
              </label>
              <div className="relative flex items-center">
                <MapPin className="w-4 h-4 absolute left-3 text-slate-500" />
                <input
                  type="text"
                  placeholder="e.g. Kyoto, Japan"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Alt Text (Accessibility)
              </label>
              <input
                type="text"
                placeholder="Describe image for screen readers"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* SUBMIT BUTTON */}
          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedFile || (currentUser && !currentUser.isVerified)}
              className="px-6 py-2 rounded-xl text-sm font-bold bg-sky-500 hover:bg-sky-400 text-white disabled:opacity-50 transition-all shadow-lg shadow-sky-500/20 flex items-center gap-2"
            >
              {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              <span>Share Post</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
