import React from 'react';
import type { SocialProfile } from '../../features/social/types.ts';

interface FriendListProps {
  friends: SocialProfile[];
  loading?: boolean;
  onOpenProfile: (userId: string) => void;
  onInvite: (userId: string) => void;
}

export default function FriendList({
  friends,
  loading = false,
  onOpenProfile,
  onInvite,
}: FriendListProps) {
  if (loading && friends.length === 0) {
    return (
      <div className="p-6 rounded-2xl border border-dashed border-[var(--ff-border-color)] text-center text-xs text-[var(--ff-text-muted)]">
        Loading friends...
      </div>
    );
  }

  if (friends.length === 0) {
    return (
      <div className="p-6 rounded-2xl border border-dashed border-[var(--ff-border-color)] text-center space-y-1.5">
        <span className="text-2xl block">👥</span>
        <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">No friends yet</h3>
        <p className="text-xs text-[var(--ff-text-muted)]">
          Search for study partners above and start studying together.
        </p>
      </div>
    );
  }

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {friends.map((friend) => (
        <article
          key={friend.userId}
          className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--ff-surface-muted)]/60 border border-[var(--ff-border-color)] hover:border-[var(--ff-accent)]/40 transition-colors"
        >
          <button
            type="button"
            className="flex items-center gap-2.5 min-w-0 text-left flex-1"
            onClick={() => onOpenProfile(friend.userId)}
          >
            <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {friend.avatarUrl ? (
                <img
                  src={friend.avatarUrl}
                  alt=""
                  loading="lazy"
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                (friend.displayName || 'F').charAt(0).toUpperCase()
              )}
              {friend.isOnline !== undefined && (
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--ff-surface-card)] ${
                    friend.isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                  }`}
                />
              )}
            </div>

            <div className="min-w-0">
              <strong className="block text-xs font-bold text-[var(--ff-text-primary)] truncate">
                {friend.displayName || 'Study Partner'}
              </strong>
              <small className="block text-[11px] text-[var(--ff-text-muted)]">
                {friend.level !== undefined ? `Level ${friend.level}` : 'Private Profile'}
                {friend.currentStreak ? ` · 🔥 ${friend.currentStreak}d` : ''}
              </small>
            </div>
          </button>

          <button
            type="button"
            disabled={friend.allowRoomInvites === false}
            onClick={() => onInvite(friend.userId)}
            aria-label={`Invite ${friend.displayName || 'Friend'}`}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--ff-accent)]/20 text-[var(--ff-accent-text)] border border-[var(--ff-accent)]/35 hover:bg-[var(--ff-accent)] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            Invite
          </button>
        </article>
      ))}
    </section>
  );
}

