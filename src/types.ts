export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  website: string;
  isPrivate: boolean;
  isVerified: boolean;
  role: string;
  createdAt?: string;
}

export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  isVerified: boolean;
  bio?: string;
}

export interface Post {
  id: string;
  userId: string;
  imageUrl: string;
  thumbnailUrl: string;
  caption: string;
  location: string;
  altText: string;
  width: number;
  height: number;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  isSaved: boolean;
  user: UserSummary;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  content: string;
  createdAt: string;
  user: UserSummary;
}

export interface Conversation {
  id: string;
  lastMessageAt: string;
  lastMessage: string;
  unreadCount: number;
  otherUser: UserSummary;
}

export interface Message {
  id: string;
  conversationId?: string;
  senderId: string;
  recipientId: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  type: 'follow' | 'follow_request' | 'follow_accept' | 'like' | 'comment' | 'message';
  postId: string | null;
  commentId: string | null;
  isRead: boolean;
  createdAt: string;
  postImageUrl: string | null;
  actor: UserSummary;
}

export interface SentEmail {
  id: string;
  to_email: string;
  subject: string;
  text_content: string;
  html_content: string;
  token: string;
  purpose: string;
  sent_at: string;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  website: string;
  isPrivate: boolean;
  isVerified: boolean;
  createdAt: string;
  postsCount: number;
  followersCount: number;
  followingCount: number;
  followStatus: 'none' | 'pending' | 'accepted';
}
