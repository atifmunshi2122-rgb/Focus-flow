import React from 'react';
import './Leaderboard.css';

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  level: number;
  totalXP: number;
  streak: number;
  rank: number;
}

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentUserId: string;
  loading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  currentUserRank?: number | null;
}

export default function Leaderboard({
  entries,
  currentUserId,
  loading = false,
  onLoadMore,
  hasMore = false,
  currentUserRank = null,
}: LeaderboardProps) {
  if (loading && entries.length === 0) {
    return <div className="leaderboard-empty">Loading leaderboard...</div>;
  }

  if (!loading && entries.length === 0) {
    return <div className="leaderboard-empty">No leaderboard data available yet.</div>;
  }

  return (
    <section className="leaderboard">
      <header className="leaderboard-header flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2>Study Champions</h2>
          <p>Learn. Focus. Rise.</p>
        </div>
        {currentUserRank !== null && (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-200 border border-indigo-400/30">
            Your Rank: #{currentUserRank}
          </span>
        )}
      </header>

      <div className="leaderboard-list">
        {entries.map((entry) => {
          const isCurrentUser = entry.userId === currentUserId;

          return (
            <article
              key={entry.userId}
              className={[
                'leaderboard-row',
                entry.rank <= 3 ? `rank-${entry.rank}` : '',
                isCurrentUser ? 'current-user' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="leaderboard-rank">
                {entry.rank === 1 ? '👑' : `#${entry.rank}`}
              </div>

              <div className="leaderboard-avatar">
                {entry.avatarUrl ? (
                  <img src={entry.avatarUrl} alt="" loading="lazy" />
                ) : (
                  entry.displayName.charAt(0).toUpperCase()
                )}
              </div>

              <div className="leaderboard-player">
                <strong>
                  {entry.displayName}
                  {isCurrentUser ? ' (You)' : ''}
                </strong>

                <small>
                  Level {entry.level} · 🔥 {entry.streak} days
                </small>
              </div>

              <div className="leaderboard-xp">
                <strong>{entry.totalXP.toLocaleString()}</strong>
                <small>XP</small>
              </div>
            </article>
          );
        })}
      </div>

      {hasMore && (
        <button
          type="button"
          disabled={loading}
          className="leaderboard-more"
          onClick={onLoadMore}
        >
          {loading ? 'Loading...' : 'Load More'}
        </button>
      )}
    </section>
  );
}

