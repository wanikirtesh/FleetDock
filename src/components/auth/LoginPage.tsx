import React, { useState } from 'react';
import { Boxes, LogIn, UserPlus, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getApiBaseUrl, setApiBaseUrl } from '../../services/api';

export const LoginPage: React.FC = () => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [serverUrl, setServerUrl] = useState(getApiBaseUrl());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'register' && password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      setApiBaseUrl(serverUrl);
      await (mode === 'login' ? login(username, password) : register(username, password));
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  const input =
    'w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-cyan-500';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans">
      <form onSubmit={submit} className="w-full max-w-sm p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-emerald-500 flex items-center justify-center">
            <Boxes className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">FleetDock</h1>
            <p className="text-xs text-slate-400">{mode === 'login' ? 'Sign in to your workspace' : 'Create your account'}</p>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-400">Username</label>
          <input className={input} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-400">Password</label>
          <input
            className={input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 8 : undefined}
            required
          />
        </div>
        {mode === 'register' && (
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Confirm password (min 8 characters)</label>
            <input className={input} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </div>
        )}

        <details className="text-xs text-slate-400">
          <summary className="cursor-pointer">Backend server URL</summary>
          <input
            className={`${input} mt-2 font-mono text-xs`}
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://localhost:8080 (blank = same origin)"
          />
        </details>

        {error && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
          }}
          className="w-full text-xs text-slate-400 hover:text-slate-200 underline"
        >
          {mode === 'login' ? 'No account? Register' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
};
