import React, { useState } from 'react';
import {
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  MoreHorizontal,
  MapPin,
  CheckCircle,
  Send,
  Sparkles,
} from 'lucide-react';
import { Post, User } from '../types';
import { formatTimeAgo, apiFetch } from '../api';

interface FeedProps {
  posts: Post[];
  currentUser: User | null;
  onPostClick: (post: Post) => void;
  onUserClick: (username: string) => void;
  onTagClick: (tag: string) => void;
  onLikeToggle: (postId: string) => void;
  onSaveToggle: (postId: string) => void;
  onCommentAdded: (postId: string, newComment: any) => void;
  onReportClick: (postId: string) => void;
  onExploreClick: () => void;
  creators: Array<{ username: string; displayName: string; avatarUrl: string }>;
}

export const Feed: React.FC<FeedProps> = ({
  posts,
  currentUser,
  onPostClick,
  onUserClick,
  onTagClick,
  onLikeToggle,
  onSaveToggle,
  onCommentAdded,
  onReportClick,
  onExploreClick,
  creators,
}) => {
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleInlineComment = async (postId: string) => {
    const text = (commentInputs[postId] || '').trim();
    if (!text || !currentUser) return;

    setSubmittingComment((prev) => ({ ...prev, [postId]: true }));
    const { data, error } = await apiFetch(`/api/engagement/comments/${postId}`, {
      method: 'POST',
      body: JSON.stringify({ content: text }),
    });
    setSubmittingComment((prev) => ({ ...prev, [postId]: false }));

    if (data?.comment) {
      onCommentAdded(postId, data.comment);
      setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
    } else if (error) {
      showToast(error);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto pb-24 pt-4 px-3 sm:px-0">
      {/* TOAST ALERT */}
      {toastMessage && (
        <div
          id="feed-toast"
          className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white border border-sky-500/30 px-4 py-2.5 rounded-xl shadow-2xl text-sm font-medium animate-in fade-in slide-in-from-top-3 flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4 text-sky-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* FEATURED CREATORS STRIP */}
      {creators.length > 0 && (
        <div
          id="featured-creators-strip"
          className="bg-[#111622] border border-[#1e293b] rounded-2xl p-4 mb-6 shadow-sm"
        >
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Discover Creators
            </span>
            <button
              onClick={onExploreClick}
              className="text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors"
            >
              See All &rarr;
            </button>
          </div>
          <div className="flex items-center gap-4 overflow-x-auto pb-1 scrollbar-none">
            {creators.map((c) => (
              <button
                key={c.username}
                onClick={() => onUserClick(c.username)}
                className="flex flex-col items-center gap-1.5 group shrink-0"
              >
                <div className="p-0.5 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-sky-400 group-hover:scale-105 transition-transform">
                  <img
                    src={c.avatarUrl}
                    alt={c.displayName}
                    className="w-14 h-14 rounded-full object-cover border-2 border-[#111622]"
                  />
                </div>
                <span className="text-xs font-medium text-slate-300 group-hover:text-white max-w-[70px] truncate text-center">
                  {c.username}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* FEED POSTS */}
      {posts.length === 0 ? (
        <div
          id="empty-feed-card"
          className="bg-[#111622] border border-[#1e293b] rounded-2xl p-8 text-center"
        >
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-sky-500/10 text-sky-400 flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Your Feed is Quiet</h3>
          <p className="text-sm text-slate-400 max-w-sm mx-auto mb-6">
            Follow visual creators or explore the public gallery to discover stunning photography, design, and architecture.
          </p>
          <button
            id="btn-explore-prompt"
            onClick={onExploreClick}
            className="px-5 py-2.5 rounded-xl font-semibold text-sm bg-sky-500 hover:bg-sky-400 text-white transition-colors shadow-lg shadow-sky-500/20"
          >
            Explore Public Posts
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {posts.map((post) => (
            <article
              key={post.id}
              id={`post-card-${post.id}`}
              className="bg-[#111622] border border-[#1e293b] rounded-2xl overflow-hidden shadow-md transition-shadow hover:border-slate-700/80"
            >
              {/* POST HEADER */}
              <div className="flex items-center justify-between p-3.5 sm:p-4">
                <div
                  className="flex items-center gap-3 cursor-pointer group"
                  onClick={() => onUserClick(post.user.username)}
                >
                  <img
                    src={post.user.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
                    alt={post.user.username}
                    className="w-10 h-10 rounded-full object-cover border border-slate-700 group-hover:ring-2 group-hover:ring-sky-500/50 transition-all"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm text-white group-hover:text-sky-400 transition-colors">
                        {post.user.username}
                      </span>
                      {post.user.isVerified && (
                        <CheckCircle className="w-3.5 h-3.5 text-sky-400 fill-sky-400/20" />
                      )}
                    </div>
                    {post.location && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        <span>{post.location}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{formatTimeAgo(post.createdAt)}</span>
                  <button
                    id={`btn-post-menu-${post.id}`}
                    onClick={() => onReportClick(post.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800/60"
                    title="Report post"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* POST IMAGE */}
              <div
                className="relative bg-black select-none cursor-pointer overflow-hidden group"
                onClick={() => onPostClick(post)}
              >
                <img
                  src={post.imageUrl}
                  alt={post.altText || post.caption || 'Post image'}
                  className="w-full object-cover max-h-[640px] transition-transform duration-300 group-hover:scale-[1.01]"
                  loading="lazy"
                />
              </div>

              {/* ACTION BUTTONS */}
              <div className="p-3.5 sm:p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <button
                      id={`btn-like-${post.id}`}
                      onClick={() => onLikeToggle(post.id)}
                      className={`p-1.5 rounded-lg transition-transform active:scale-125 ${
                        post.isLiked ? 'text-rose-500' : 'text-slate-300 hover:text-white'
                      }`}
                      title={post.isLiked ? 'Unlike' : 'Like'}
                    >
                      <Heart className={`w-6 h-6 ${post.isLiked ? 'fill-rose-500' : ''}`} />
                    </button>

                    <button
                      id={`btn-comment-${post.id}`}
                      onClick={() => onPostClick(post)}
                      className="p-1.5 text-slate-300 hover:text-white rounded-lg transition-colors"
                      title="Comment"
                    >
                      <MessageCircle className="w-6 h-6" />
                    </button>

                    <button
                      id={`btn-share-${post.id}`}
                      onClick={() => {
                        const url = `${window.location.origin}/post/${post.id}`;
                        navigator.clipboard.writeText(url);
                        showToast('Post link copied to clipboard!');
                      }}
                      className="p-1.5 text-slate-300 hover:text-white rounded-lg transition-colors"
                      title="Share link"
                    >
                      <Share2 className="w-5 h-5" />
                    </button>
                  </div>

                  <button
                    id={`btn-save-${post.id}`}
                    onClick={() => onSaveToggle(post.id)}
                    className={`p-1.5 rounded-lg transition-transform active:scale-110 ${
                      post.isSaved ? 'text-amber-400' : 'text-slate-300 hover:text-white'
                    }`}
                    title={post.isSaved ? 'Remove Bookmark' : 'Bookmark'}
                  >
                    <Bookmark className={`w-6 h-6 ${post.isSaved ? 'fill-amber-400' : ''}`} />
                  </button>
                </div>

                {/* LIKES COUNT */}
                <div className="text-sm font-semibold text-slate-200 mb-2">
                  {post.likesCount === 1 ? '1 like' : `${post.likesCount.toLocaleString()} likes`}
                </div>

                {/* CAPTION WITH HASHTAGS */}
                {post.caption && (
                  <div className="text-sm text-slate-300 mb-2 leading-relaxed">
                    <span
                      onClick={() => onUserClick(post.user.username)}
                      className="font-semibold text-white mr-2 cursor-pointer hover:underline"
                    >
                      {post.user.username}
                    </span>
                    <span>
                      {post.caption.split(' ').map((word, idx) => {
                        if (word.startsWith('#')) {
                          return (
                            <span
                              key={idx}
                              onClick={(e) => {
                                e.stopPropagation();
                                onTagClick(word.substring(1));
                              }}
                              className="text-sky-400 font-medium cursor-pointer hover:underline mr-1"
                            >
                              {word}
                            </span>
                          );
                        }
                        return word + ' ';
                      })}
                    </span>
                  </div>
                )}

                {/* COMMENTS SUMMARY */}
                {post.commentsCount > 0 && (
                  <button
                    onClick={() => onPostClick(post)}
                    className="text-xs font-medium text-slate-400 hover:text-slate-300 mb-3 block"
                  >
                    View all {post.commentsCount} comments
                  </button>
                )}

                {/* INLINE COMMENT INPUT */}
                {currentUser ? (
                  <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
                    <input
                      id={`input-inline-comment-${post.id}`}
                      type="text"
                      placeholder="Add a comment..."
                      value={commentInputs[post.id] || ''}
                      onChange={(e) =>
                        setCommentInputs({ ...commentInputs, [post.id]: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleInlineComment(post.id);
                      }}
                      className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none py-1"
                    />
                    {(commentInputs[post.id] || '').trim().length > 0 && (
                      <button
                        id={`btn-submit-inline-${post.id}`}
                        onClick={() => handleInlineComment(post.id)}
                        disabled={submittingComment[post.id]}
                        className="text-xs font-bold text-sky-400 hover:text-sky-300 disabled:opacity-50 flex items-center gap-1"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Post</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 pt-2 border-t border-slate-800/60">
                    Log in to like, comment, or bookmark.
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
