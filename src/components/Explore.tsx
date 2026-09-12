import React, { useState, useEffect } from 'react';
import { Search, Heart, MessageCircle, Hash, User as UserIcon, CheckCircle } from 'lucide-react';
import { Post, UserSummary } from '../types';
import { apiFetch } from '../api';

interface ExploreProps {
  onPostClick: (post: Post) => void;
  onUserClick: (username: string) => void;
  activeTag: string;
  setActiveTag: (tag: string) => void;
}

const POPULAR_TAGS = ['all', 'minimalism', 'architecture', 'travel', 'design', 'nature', 'nordic'];

export const Explore: React.FC<ExploreProps> = ({
  onPostClick,
  onUserClick,
  activeTag,
  setActiveTag,
}) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  // Load explore posts
  useEffect(() => {
    let isMounted = true;
    async function loadExplore() {
      setLoading(true);
      const tagParam = activeTag && activeTag !== 'all' ? `?tag=${encodeURIComponent(activeTag)}` : '';
      const { data } = await apiFetch(`/api/posts/explore${tagParam}`);
      if (isMounted) {
        if (data?.posts) {
          setPosts(data.posts);
        }
        setLoading(false);
      }
    }
    loadExplore();
    return () => {
      isMounted = false;
    };
  }, [activeTag]);

  // Debounced user search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      const { data } = await apiFetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
      if (data?.users) {
        setSearchResults(data.users);
      }
      setSearching(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <div className="w-full max-w-5xl mx-auto pb-24 pt-4 px-3 sm:px-6">
      {/* SEARCH HEADER */}
      <div className="relative mb-6">
        <div className="relative flex items-center">
          <Search className="w-5 h-5 absolute left-4 text-slate-400 pointer-events-none" />
          <input
            id="explore-search-input"
            type="text"
            placeholder="Search creators, usernames, or hashtags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#111622] border border-[#1e293b] rounded-2xl pl-12 pr-4 py-3 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-sky-500/50 shadow-inner"
          />
          {searching && (
            <div className="absolute right-4 w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        {/* SEARCH RESULTS DROPDOWN */}
        {searchResults.length > 0 && searchQuery.trim() && (
          <div
            id="search-results-dropdown"
            className="absolute top-full left-0 right-0 mt-2 bg-[#111622] border border-slate-700 rounded-2xl shadow-2xl p-2 z-30 max-h-80 overflow-y-auto space-y-1"
          >
            {searchResults.map((user) => (
              <div
                key={user.id}
                onClick={() => {
                  onUserClick(user.username);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-800/60 cursor-pointer transition-colors"
              >
                <img
                  src={user.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
                  alt={user.username}
                  className="w-9 h-9 rounded-full object-cover border border-slate-700"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm text-white truncate">{user.username}</span>
                    {user.isVerified && <CheckCircle className="w-3.5 h-3.5 text-sky-400" />}
                  </div>
                  <p className="text-xs text-slate-400 truncate">{user.displayName}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HASHTAG PILLS */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-4 scrollbar-none">
        {POPULAR_TAGS.map((tag) => {
          const isSelected = activeTag === tag || (!activeTag && tag === 'all');
          return (
            <button
              key={tag}
              id={`tag-pill-${tag}`}
              onClick={() => setActiveTag(tag === 'all' ? '' : tag)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                  : 'bg-[#111622] text-slate-300 hover:text-white border border-[#1e293b] hover:bg-slate-800'
              }`}
            >
              #{tag}
            </button>
          );
        })}
      </div>

      {/* DISCOVERY GRID */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square bg-slate-800/40 rounded-xl" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 bg-[#111622] border border-[#1e293b] rounded-2xl">
          <Hash className="w-10 h-10 mx-auto text-slate-500 mb-3" />
          <h3 className="text-base font-bold text-white mb-1">No posts found</h3>
          <p className="text-xs text-slate-400">Try selecting another hashtag or clearing your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
          {posts.map((post) => (
            <div
              key={post.id}
              id={`explore-grid-item-${post.id}`}
              onClick={() => onPostClick(post)}
              className="group relative aspect-square bg-slate-900 rounded-xl overflow-hidden cursor-pointer shadow-sm"
            >
              <img
                src={post.thumbnailUrl || post.imageUrl}
                alt={post.caption || 'Explore post'}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
              {/* HOVER OVERLAY */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6 text-white font-bold text-sm">
                <div className="flex items-center gap-1.5">
                  <Heart className="w-5 h-5 fill-white text-white" />
                  <span>{post.likesCount}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MessageCircle className="w-5 h-5 fill-white text-white" />
                  <span>{post.commentsCount}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
