import React, { useState, type FormEvent } from 'react';
import type { StudyChatMessage } from '../../features/social/squad-types.ts';
import './StudyChat.css';

interface StudyChatProps {
  messages: StudyChatMessage[];
  currentUserId: string;
  onSend: (text: string) => Promise<void>;
  onReact: (messageId: string, emoji: string) => Promise<void>;
  loading?: boolean;
}

export default function StudyChat({
  messages,
  currentUserId,
  onSend,
  onReact,
  loading = false,
}: StudyChatProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || sending || text.length > 1000) return;

    try {
      setSending(true);
      await onSend(text);
      setMessage('');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="study-chat">
      <header className="study-chat-header">
        <h3>Study Chat</h3>
        <span>Group Conversation</span>
      </header>

      <div className="study-chat-messages" aria-live="polite">
        {loading && messages.length === 0 && <p className="chat-empty">Loading messages...</p>}

        {!loading && messages.length === 0 && (
          <p className="chat-empty">Start your squad conversation.</p>
        )}

        {messages.map((item) => {
          const own = item.senderId === currentUserId;
          return (
            <article key={item.id} className={`chat-message ${own ? 'own-message' : ''}`}>
              <div className="chat-message-author">
                {item.senderName} ·{' '}
                {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>

              <div className="chat-message-bubble">
                {item.deletedAt ? 'This message was deleted.' : item.text}
              </div>

              {!item.deletedAt && (
                <div className="chat-message-actions">
                  {(['👍', '❤️', '🔥'] as const).map((emoji) => {
                    const count = item.reactionCounts?.[emoji] || 0;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => void onReact(item.id, emoji)}
                        aria-label={`React with ${emoji}`}
                      >
                        {emoji}
                        {count > 0 ? ` ${count}` : ''}
                      </button>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <form className="study-chat-composer" onSubmit={handleSubmit}>
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={1000}
          placeholder="Write a message..."
          aria-label="Chat message"
        />

        <button type="submit" disabled={sending || !message.trim()}>
          {sending ? 'Sending...' : 'Send'}
        </button>
      </form>
    </section>
  );
}

