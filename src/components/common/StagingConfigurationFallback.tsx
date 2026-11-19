import React from 'react';
import { ShieldAlert, Terminal, RefreshCw, ExternalLink } from 'lucide-react';

interface StagingConfigurationFallbackProps {
  error: Error;
}

export const StagingConfigurationFallback: React.FC<StagingConfigurationFallbackProps> = ({ error }) => {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-slate-100 p-4 md:p-8 font-sans antialiased">
      <div className="max-w-xl w-full bg-slate-900 border border-amber-500/30 rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
        {/* Top Glow Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600" />

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-amber-400 flex items-center gap-1.5">
              <span>Safety Gate Active</span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Preview Staging Configuration Required
            </h1>
          </div>
        </div>

        {/* Message */}
        <p className="text-sm text-slate-300 leading-relaxed mb-6">
          This deployment is running in a <strong>Vercel Preview</strong> environment. To strictly prevent accidental access to or corruption of <strong>Production Firebase Data</strong>, automatic fallback to production credentials has been disabled.
        </p>

        {/* Error Detail Box */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-6">
          <div className="text-xs font-mono text-slate-400 mb-1 flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-slate-500" />
            <span>Resolution Error</span>
          </div>
          <code className="text-xs font-mono text-amber-300 block break-words whitespace-pre-wrap">
            {error.message}
          </code>
        </div>

        {/* Instructions */}
        <div className="space-y-3 mb-6 text-xs text-slate-400">
          <div className="font-semibold text-slate-200">Required Vercel Setup:</div>
          <ol className="list-decimal list-inside space-y-1.5 pl-1">
            <li>Open your <strong>Vercel Project Dashboard</strong> &rarr; <strong>Settings</strong> &rarr; <strong>Environment Variables</strong>.</li>
            <li>Add your dedicated Staging Firebase project credentials.</li>
            <li>Ensure they are scoped <strong>exclusively to the Preview environment</strong>:</li>
          </ol>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 font-mono text-[11px] text-slate-300 space-y-1">
            <div>VITE_FIREBASE_PROJECT_ID=&lt;your-staging-project&gt;</div>
            <div>VITE_FIREBASE_API_KEY=&lt;your-staging-api-key&gt;</div>
            <div>VITE_FIREBASE_AUTH_DOMAIN=&lt;your-staging-project.firebaseapp.com&gt;</div>
            <div>VITE_FIREBASE_DATABASE_ID=&lt;your-staging-firestore-db&gt;</div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-slate-800/80">
          <button
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reload Application</span>
          </button>
          <a
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors border border-slate-700"
          >
            <span>Vercel Dashboard</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>
        </div>
      </div>
    </div>
  );
};

