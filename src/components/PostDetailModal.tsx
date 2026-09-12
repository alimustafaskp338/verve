import React, { useState, useEffect } from 'react';
import {
  X,
  Heart,
  Bookmark,
  Share2,
  Trash2,
  Edit2,
  CheckCircle,
  MapPin,
  Send,
  Flag,
  MoreVertical,
} from 'lucide-react';
import { Post, Comment, User } from '../types';
import { apiFetch, formatTimeAgo } from '../api';

interface PostDetailModalProps {
  post: Post | null;
  currentUser: User | null;
  onClose: () => void;
  onUserClick: (username: string) => void;
  onLikeToggle: (postId: string) => void;
  onSaveToggle: (postId: string) => void;
  onPostDeleted: (postId: string) => void;
  onReportClick: (postId: string) => void;
}

export const PostDetailModal: React.FC<PostDetailModalProps> = ({
  post,
  currentUser,
  onClose,
  onUserClick,
  onLikeToggle,
  onSaveToggle,
  onPostDeleted,
  onReportClick,
}) => {
  if (!post) return null;

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionValue, setCaptionValue] = useState(post.caption);
  const [savingCaption, setSavingCaption] = useState(false);
  const [deletingPost, setDeletingPost] = useState(false);

  const isAuthor = currentUser?.id === post.userId;

  // Load comments
  useEffect(() => {
    let isMounted = true;
    async function loadComments() {
      const { data } = await apiFetch(`/api/engagement/comments/${post.id}`);
      if (isMounted && data?.comments) {
        setComments(data.comments);
      }
    }
    loadComments();
    return () => {
      isMounted = false;
    };
  }, [post.id]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !currentUser) return;

    setSubmittingComment(true);
    setCommentError(null);
    const { data, error } = await apiFetch(`/api/engagement/comments/${post.id}`, {
      method: 'POST',
      body: JSON.stringify({ content: commentText.trim() }),
    });
    setSubmittingComment(false);

    if (data?.comment) {
      setComments((prev) => [...prev, data.comment]);
      setCommentText('');
      post.commentsCount += 1;
    } else if (error) {
      setCommentError(error);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const confirmed = window.confirm ? window.confirm('Are you sure you want to delete this comment?') : true;
    if (!confirmed) return;
    const { error } = await apiFetch(`/api/engagement/comments/${commentId}`, {
      method: 'DELETE',
    });
    if (!error) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      post.commentsCount = Math.max(0, post.commentsCount - 1);
    }
  };

  const handleSaveCaption = async () => {
    setSavingCaption(true);
    const { error } = await apiFetch(`/api/posts/${post.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ caption: captionValue }),
    });
    setSavingCaption(false);
    if (!error) {
      post.caption = captionValue;
      setEditingCaption(false);
    }
  };

  const handleDeletePost = async () => {
    if (!confirm('Are you sure you want to permanently delete this post?')) return;
    setDeletingPost(true);
    const { error } = await apiFetch(`/api/posts/${post.id}`, {
      method: 'DELETE',
    });
    setDeletingPost(false);
    if (!error) {
      onPostDeleted(post.id);
      onClose();
    }
  };

  return (
    <div
      id="post-detail-modal-backdrop"
      onClick={onClose}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-6 animate-in fade-in duration-200"
    >
      <div
        id="post-detail-modal-card"
        onClick={(e) => e.stopPropagation()}
        className="bg-[#111622] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden shadow-2xl relative"
      >
        {/* CLOSE BUTTON */}
        <button
          id="btn-close-post-modal"
          onClick={onClose}
          className="absolute top-3 right-3 z-20 p-2 bg-black/60 hover:bg-black/90 text-white rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* LEFT: IMAGE */}
        <div className="w-full md:w-[55%] bg-black flex items-center justify-center relative min-h-[300px] max-h-[50vh] md:max-h-[85vh]">
          <img
            src={post.imageUrl}
            alt={post.altText || post.caption || 'Post'}
            className="w-full h-full object-contain"
          />
        </div>

        {/* RIGHT: DETAILS & COMMENTS */}
        <div className="w-full md:w-[45%] flex flex-col h-full bg-[#111622]">
          {/* AUTHOR HEADER */}
          <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
            <div
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => {
                onUserClick(post.user.username);
                onClose();
              }}
            >
              <img
                src={post.user.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
                alt={post.user.username}
                className="w-9 h-9 rounded-full object-cover border border-slate-700 group-hover:ring-2 group-hover:ring-sky-500 transition-all"
              />
              <div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-sm text-white group-hover:text-sky-400">
                    {post.user.username}
                  </span>
                  {post.user.isVerified && <CheckCircle className="w-3.5 h-3.5 text-sky-400" />}
                </div>
                {post.location && (
                  <div className="flex items-center gap-1 text-[11px] text-slate-400">
                    <MapPin className="w-3 h-3 text-slate-500" />
                    <span>{post.location}</span>
                  </div>
                )}
              </div>
            </div>

            {/* AUTHOR CONTROLS / ACTIONS */}
            <div className="flex items-center gap-1">
              {isAuthor ? (
                <>
                  <button
                    id="btn-edit-caption"
                    onClick={() => setEditingCaption(!editingCaption)}
                    className="p-1.5 text-slate-400 hover:text-sky-400 rounded-lg hover:bg-slate-800"
                    title="Edit Caption"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    id="btn-delete-post"
                    onClick={handleDeletePost}
                    disabled={deletingPost}
                    className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800"
                    title="Delete Post"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button
                  id="btn-report-post-detail"
                  onClick={() => onReportClick(post.id)}
                  className="p-1.5 text-slate-400 hover:text-amber-400 rounded-lg hover:bg-slate-800"
                  title="Report Post"
                >
                  <Flag className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* CAPTION & COMMENTS SCROLL CONTAINER */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* CAPTION BLOCK */}
            {editingCaption ? (
              <div className="space-y-2 bg-slate-900/60 p-3 rounded-xl border border-slate-700">
                <textarea
                  value={captionValue}
                  onChange={(e) => setCaptionValue(e.target.value)}
                  className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none resize-none h-20"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditingCaption(false)}
                    className="px-3 py-1 rounded text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveCaption}
                    disabled={savingCaption}
                    className="px-3 py-1 rounded text-xs font-bold bg-sky-500 hover:bg-sky-400 text-white"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              post.caption && (
                <div className="flex gap-3 text-sm">
                  <img
                    src={post.user.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
                    alt={post.user.username}
                    className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5"
                  />
                  <div className="text-slate-300">
                    <span className="font-semibold text-white mr-2">{post.user.username}</span>
                    <span>{post.caption}</span>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {formatTimeAgo(post.createdAt)}
                    </div>
                  </div>
                </div>
              )
            )}

            {/* COMMENTS LIST */}
            {comments.map((c) => {
              const canDelete =
                currentUser?.id === c.userId || currentUser?.id === post.userId;
              return (
                <div key={c.id} className="flex gap-3 text-sm group">
                  <img
                    src={c.user.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
                    alt={c.user.username}
                    className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5 cursor-pointer"
                    onClick={() => {
                      onUserClick(c.user.username);
                      onClose();
                    }}
                  />
                  <div className="flex-1 text-slate-300">
                    <div className="flex items-center justify-between">
                      <span
                        className="font-semibold text-white mr-2 cursor-pointer hover:underline"
                        onClick={() => {
                          onUserClick(c.user.username);
                          onClose();
                        }}
                      >
                        {c.user.username}
                      </span>
                      {canDelete && (
                        <button
                          onClick={() => handleDeleteComment(c.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-opacity p-1"
                          title="Delete comment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-slate-300 text-xs mt-0.5 leading-relaxed">{c.content}</p>
                    <div className="text-[10px] text-slate-500 mt-1">
                      {formatTimeAgo(c.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ENGAGEMENT FOOTER */}
          <div className="p-4 border-t border-slate-800 bg-[#0e131d]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onLikeToggle(post.id)}
                  className={`p-1.5 rounded-lg active:scale-125 transition-transform ${
                    post.isLiked ? 'text-rose-500' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Heart className={`w-6 h-6 ${post.isLiked ? 'fill-rose-500' : ''}`} />
                </button>
                <button
                  onClick={() => {
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`);
                    }
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="p-1.5 text-slate-300 hover:text-white relative"
                  title="Share post"
                >
                  <Share2 className="w-5 h-5" />
                  {copiedLink && (
                    <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-sky-500 text-white text-[10px] rounded font-bold whitespace-nowrap shadow">
                      Link Copied!
                    </span>
                  )}
                </button>
              </div>

              <button
                onClick={() => onSaveToggle(post.id)}
                className={`p-1.5 rounded-lg active:scale-110 transition-transform ${
                  post.isSaved ? 'text-amber-400' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Bookmark className={`w-6 h-6 ${post.isSaved ? 'fill-amber-400' : ''}`} />
              </button>
            </div>

            <div className="text-xs font-bold text-slate-200 mb-1">
              {post.likesCount} {post.likesCount === 1 ? 'like' : 'likes'}
            </div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">
              {new Date(post.createdAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>

            {/* ADD COMMENT INPUT */}
            {currentUser ? (
              <form onSubmit={handleAddComment} className="flex items-center gap-2 pt-2 border-t border-slate-800">
                <input
                  type="text"
                  placeholder="Write a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={submittingComment || !commentText.trim()}
                  className="text-xs font-bold text-sky-400 hover:text-sky-300 disabled:opacity-40"
                >
                  Post
                </button>
              </form>
            ) : (
              <p className="text-xs text-slate-500">Log in to leave a comment.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
