import React, { useState } from 'react';
import type { SquadPrivacy } from '../../features/social/squad-types.ts';

interface CreateSquadFormProps {
  onCreate: (data: {
    name: string;
    description: string;
    privacy: SquadPrivacy;
  }) => Promise<void>;
}

export default function CreateSquadForm({ onCreate }: CreateSquadFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<SquadPrivacy>('private');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    if (name.trim().length < 3) {
      setError('Squad name must contain at least 3 characters.');
      return;
    }
    if (name.trim().length > 40) {
      setError('Squad name cannot exceed 40 characters.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        privacy,
      });
      setName('');
      setDescription('');
      setPrivacy('private');
    } catch (err: any) {
      setError(err?.message || 'Unable to create squad. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-3"
      onSubmit={handleSubmit}
    >
      <h2 className="text-sm font-bold text-[var(--ff-text-primary)]">Create Study Squad</h2>

      <div>
        <label htmlFor="squad-name" className="block text-[11px] font-semibold text-[var(--ff-text-muted)] mb-1">
          Squad Name
        </label>
        <input
          id="squad-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          placeholder="Enter squad name"
          required
          className="w-full px-3 py-2 rounded-xl text-xs bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
        />
      </div>

      <div>
        <label htmlFor="squad-description" className="block text-[11px] font-semibold text-[var(--ff-text-muted)] mb-1">
          Description
        </label>
        <textarea
          id="squad-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={250}
          rows={2}
          placeholder="Describe your study squad"
          className="w-full px-3 py-2 rounded-xl text-xs bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
        />
      </div>

      <div>
        <label htmlFor="squad-privacy" className="block text-[11px] font-semibold text-[var(--ff-text-muted)] mb-1">
          Privacy
        </label>
        <select
          id="squad-privacy"
          value={privacy}
          onChange={(event) => setPrivacy(event.target.value as SquadPrivacy)}
          className="w-full px-3 py-2 rounded-xl text-xs bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
        >
          <option value="private">Private (Invite Only)</option>
          <option value="public">Public (Discoverable)</option>
          <option value="unlisted">Unlisted</option>
        </select>
      </div>

      {error && <p className="text-xs text-red-400 font-medium">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 rounded-xl text-xs font-bold bg-[var(--ff-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {loading ? 'Creating...' : 'Create Squad'}
      </button>
    </form>
  );
}

