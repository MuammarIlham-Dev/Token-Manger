import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Activity, AlertTriangle, Check, ChevronDown, CircleHelp, Clock3, Code2,
  Gauge, KeyRound, Laptop2, Mail, Menu, MoreHorizontal, Pencil, Plus, Search,
  Settings2, ShieldCheck, Sparkles, TimerReset, Trash2, X, Zap,
} from 'lucide-react';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

type Status = 'ready' | 'limited';
type Profile = {
  id: string;
  ide: string;
  name: string;
  email: string;
  agent: string;
  duration: number;
  status: Status;
  limitedUntil: number | null;
  createdAt: number;
};

const STORAGE_KEY = 'ai-token-timer-profiles-v1';
const queryClient = new QueryClient();
const ideOptions = ['Cursor', 'Windsurf', 'VS Code', 'Zed', 'JetBrains'];
const agentOptions = ['Claude', 'GPT-4o', 'Gemini', 'Cohere', 'Other'];
const durationOptions = [1, 4, 8, 12, 24, 48];

const seededProfiles: Profile[] = [
  { id: 'p-claude', ide: 'Cursor', name: 'Main build account', email: 'dev@northstar.studio', agent: 'Claude', duration: 8, status: 'ready', limitedUntil: null, createdAt: Date.now() - 86400000 * 4 },
  { id: 'p-gpt', ide: 'Windsurf', name: 'Side projects', email: 'hello@northstar.studio', agent: 'GPT-4o', duration: 4, status: 'limited', limitedUntil: Date.now() + 1000 * 60 * 47 + 1000 * 32, createdAt: Date.now() - 86400000 * 2 },
  { id: 'p-gemini', ide: 'VS Code', name: 'Experiments', email: 'lab@northstar.studio', agent: 'Gemini', duration: 12, status: 'ready', limitedUntil: null, createdAt: Date.now() - 86400000 },
];

function loadProfiles(): Profile[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as Profile[];
  } catch { /* use the considered defaults if storage is unavailable */ }
  return seededProfiles;
}

function formatCountdown(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function initials(value: string) {
  return value.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function AppLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] shadow-[0_8px_20px_hsl(var(--sidebar-primary)/.2)]">
        <Gauge size={20} strokeWidth={2.4} />
        <span className="absolute bottom-[7px] h-1 w-1 rounded-full bg-[hsl(var(--accent))]" />
      </div>
      <div>
        <div className="text-[15px] font-extrabold tracking-[-.03em] text-[hsl(var(--sidebar-foreground))]">token timer</div>
        <div className="mono mt-0.5 text-[9px] uppercase tracking-[.18em] text-[hsl(var(--sidebar-foreground)/.48)]">access control room</div>
      </div>
    </div>
  );
}

function Sidebar({ count, onAdd }: { count: number; onAdd: () => void }) {
  const nav = [
    { label: 'Profiles', icon: KeyRound, active: true, detail: String(count).padStart(2, '0') },
    { label: 'Activity log', icon: Activity, active: false, detail: '' },
  ];
  return (
    <aside className="hidden w-[248px] shrink-0 flex-col bg-[hsl(var(--sidebar))] px-5 py-6 text-[hsl(var(--sidebar-foreground))] md:flex">
      <AppLogo />
      <div className="mt-12">
        <div className="mono mb-3 px-3 text-[9px] font-medium uppercase tracking-[.2em] text-[hsl(var(--sidebar-foreground)/.42)]">Workspace</div>
        <nav className="space-y-1">
          {nav.map(({ label, icon: Icon, active, detail }) => (
            <div key={label} data-testid={`nav-${label.toLowerCase().replace(' ', '-')}`} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold ${active ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))]' : 'text-[hsl(var(--sidebar-foreground)/.58)]'}`}>
              <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
              <span className="flex-1">{label}</span>
              {detail && <span className="mono text-[10px] text-[hsl(var(--sidebar-foreground)/.42)]">{detail}</span>}
            </div>
          ))}
        </nav>
      </div>
      <div className="mt-auto">
        <div className="mb-5 rounded-2xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent)/.5)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="mono text-[9px] uppercase tracking-[.15em] text-[hsl(var(--sidebar-foreground)/.45)]">Local vault</span>
            <ShieldCheck size={15} className="text-[hsl(var(--sidebar-primary))]" />
          </div>
          <p className="text-[11px] leading-relaxed text-[hsl(var(--sidebar-foreground)/.6)]">Your profiles stay in this browser. Nothing leaves your machine.</p>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-[hsl(var(--sidebar-primary))]"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" /> encrypted at rest</div>
        </div>
        <div className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[12px] font-semibold text-[hsl(var(--sidebar-foreground)/.57)]" data-testid="text-preferences"><Settings2 size={16} /> Preferences</div>
        <button type="button" onClick={onAdd} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--sidebar-primary))] py-3 text-[12px] font-extrabold text-[hsl(var(--sidebar-primary-foreground))] shadow-[0_10px_24px_hsl(var(--sidebar-primary)/.18)] transition-transform hover:-translate-y-0.5 active:translate-y-0" data-testid="button-add-sidebar"><Plus size={15} strokeWidth={2.8} /> New profile</button>
      </div>
    </aside>
  );
}

function Topbar({ onAdd, onMenu }: { onAdd: () => void; onMenu: () => void }) {
  return (
    <header className="flex items-center justify-between border-b border-[hsl(var(--border)/.75)] px-5 py-4 md:hidden">
      <button type="button" onClick={onMenu} className="focus-ring rounded-lg p-1" data-testid="button-mobile-menu"><Menu size={21} /></button>
      <AppLogo />
      <button type="button" onClick={onAdd} className="focus-ring rounded-lg bg-[hsl(var(--primary))] p-2 text-[hsl(var(--primary-foreground))]" data-testid="button-add-mobile"><Plus size={18} /></button>
    </header>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return status === 'limited'
    ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--accent)/.18)] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.08em] text-[hsl(28 76% 34%)]"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" /> Limited</span>
    : <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--primary)/.12)] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.08em] text-[hsl(var(--primary))]"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" /> Ready</span>;
}

function ProfileCard({ profile, now, onEdit, onDelete, onLimit, onReset }: {
  profile: Profile; now: number; onEdit: () => void; onDelete: () => void; onLimit: () => void; onReset: () => void;
}) {
  const remaining = profile.limitedUntil ? profile.limitedUntil - now : 0;
  const isLimited = profile.status === 'limited' && remaining > 0;
  const progress = isLimited ? Math.min(100, Math.max(2, (remaining / (profile.duration * 3600000)) * 100)) : 0;
  return (
    <article className={`card-shadow animate-rise group relative overflow-hidden rounded-2xl border bg-[hsl(var(--card))] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_44px_hsl(205_30%_22%/.12)] ${isLimited ? 'border-[hsl(var(--accent)/.48)]' : 'border-[hsl(var(--card-border))]'}`} data-testid={`card-profile-${profile.id}`}>
      {isLimited && <div className="scan-line" />}
      <div className="relative p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] text-[12px] font-extrabold ${isLimited ? 'bg-[hsl(var(--accent)/.18)] text-[hsl(28_76%_34%)]' : 'bg-[hsl(var(--primary)/.13)] text-[hsl(var(--primary))]'}`}>{initials(profile.name)}</div>
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-extrabold tracking-[-.02em]">{profile.name}</h3>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]"><Laptop2 size={12} /> {profile.ide}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <StatusBadge status={isLimited ? 'limited' : 'ready'} />
            <div className="relative ml-1">
              <button type="button" onClick={onEdit} className="focus-ring rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] opacity-60 transition-all hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] group-hover:opacity-100" data-testid={`button-edit-${profile.id}`} aria-label={`Edit ${profile.name}`}><MoreHorizontal size={17} /></button>
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-y border-[hsl(var(--border)/.7)] py-4">
          <div><div className="mono mb-1.5 text-[9px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Agent</div><div className="flex items-center gap-1.5 text-[12px] font-bold"><Sparkles size={13} className="text-[hsl(var(--accent))]" />{profile.agent}</div></div>
          <div className="min-w-0"><div className="mono mb-1.5 text-[9px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Identity</div><div className="flex min-w-0 items-center gap-1.5 truncate text-[12px] font-semibold text-[hsl(var(--muted-foreground))]"><Mail size={12} /> <span className="truncate">{profile.email}</span></div></div>
        </div>
        {isLimited ? (
          <div className="mt-5 rounded-xl bg-[hsl(var(--accent)/.1)] p-3.5">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-[11px] font-bold text-[hsl(28_76%_34%)]"><Clock3 size={14} /> Available in</div><span className="mono text-[16px] font-medium tracking-[-.04em] text-[hsl(28_76%_30%)]" data-testid={`countdown-${profile.id}`}>{formatCountdown(remaining)}</span></div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-[hsl(var(--accent)/.18)]"><div className="h-full rounded-full bg-[hsl(var(--accent))] transition-[width] duration-1000 ease-linear" style={{ width: `${progress}%` }} /></div>
          </div>
        ) : (
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-[hsl(var(--primary)/.07)] px-3.5 py-3 text-[11px] font-bold text-[hsl(var(--primary))]"><Check size={14} /> Ready to use <span className="ml-auto mono text-[9px] font-normal text-[hsl(var(--muted-foreground))]">{profile.duration}h window</span></div>
        )}
        <div className="mt-4 flex items-center justify-between">
          {isLimited ? <button type="button" onClick={onReset} className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-extrabold text-[hsl(var(--primary))] transition-colors hover:bg-[hsl(var(--primary)/.09)]" data-testid={`button-reset-${profile.id}`}><TimerReset size={14} /> Reset timer</button>
            : <button type="button" onClick={onLimit} className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-extrabold text-[hsl(var(--accent-foreground))] transition-colors hover:bg-[hsl(var(--accent)/.15)]" data-testid={`button-limit-${profile.id}`}><AlertTriangle size={14} /> Mark limit reached</button>}
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button type="button" onClick={onEdit} className="focus-ring rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid={`button-pencil-${profile.id}`} aria-label="Edit profile"><Pencil size={14} /></button>
            <button type="button" onClick={onDelete} className="focus-ring rounded-lg p-1.5 text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/.1)]" data-testid={`button-delete-${profile.id}`} aria-label="Delete profile"><Trash2 size={14} /></button>
          </div>
        </div>
      </div>
    </article>
  );
}

type FormState = Omit<Profile, 'id' | 'status' | 'limitedUntil' | 'createdAt'>;
const blankForm: FormState = { ide: 'Cursor', name: '', email: '', agent: 'Claude', duration: 8 };

function ProfileModal({ profile, onClose, onSave }: { profile: Profile | null; onClose: () => void; onSave: (form: FormState) => void }) {
  const [form, setForm] = useState<FormState>(profile ? { ide: profile.ide, name: profile.name, email: profile.email, agent: profile.agent, duration: profile.duration } : blankForm);
  const [error, setError] = useState('');
  const update = (key: keyof FormState, value: string | number) => setForm((current) => ({ ...current, [key]: value }));
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim()) { setError('Add a name and email identity to continue.'); return; }
    onSave({ ...form, name: form.name.trim(), email: form.email.trim() });
  }
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-[hsl(205_34%_11%/.48)] p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
      <div className="animate-rise w-full max-w-[520px] rounded-t-3xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-[0_24px_80px_hsl(205_34%_11%/.25)] sm:rounded-3xl sm:p-8">
        <div className="mb-7 flex items-start justify-between"><div><div className="mono mb-2 text-[9px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">{profile ? 'Update profile' : 'New access profile'}</div><h2 id="profile-modal-title" className="text-[25px] font-extrabold tracking-[-.05em]">{profile ? 'Tune this connection' : 'Keep an account close'}</h2><p className="mt-1.5 text-[12px] text-[hsl(var(--muted-foreground))]">A few details is all the timer needs.</p></div><button type="button" onClick={onClose} className="focus-ring rounded-xl p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-close-modal"><X size={18} /></button></div>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block"><span className="mono mb-2 block text-[9px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">IDE</span><div className="relative"><Code2 className="pointer-events-none absolute left-3 top-3.5 text-[hsl(var(--muted-foreground))]" size={15} /><select value={form.ide} onChange={(e) => update('ide', e.target.value)} className="focus-ring h-11 w-full appearance-none rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] pl-10 pr-8 text-[12px] font-bold" data-testid="select-ide">{ideOptions.map((ide) => <option key={ide}>{ide}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 text-[hsl(var(--muted-foreground))]" size={15} /></div></label>
            <label className="block"><span className="mono mb-2 block text-[9px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Profile name</span><input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Main build account" className="focus-ring h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] px-3 text-[12px] font-bold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))]" data-testid="input-profile-name" /></label>
          </div>
          <label className="block"><span className="mono mb-2 block text-[9px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Email identity</span><div className="relative"><Mail className="pointer-events-none absolute left-3 top-3.5 text-[hsl(var(--muted-foreground))]" size={15} /><input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="you@your-workspace.dev" className="focus-ring h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] px-10 text-[12px] font-bold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))]" data-testid="input-email" /></div></label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block"><span className="mono mb-2 block text-[9px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Agent</span><select value={form.agent} onChange={(e) => update('agent', e.target.value)} className="focus-ring h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] px-3 text-[12px] font-bold" data-testid="select-agent">{agentOptions.map((agent) => <option key={agent}>{agent}</option>)}</select></label>
            <label className="block"><span className="mono mb-2 block text-[9px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Refresh duration</span><div className="relative"><select value={form.duration} onChange={(e) => update('duration', Number(e.target.value))} className="focus-ring h-11 w-full appearance-none rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] px-3 pr-8 text-[12px] font-bold" data-testid="select-duration">{durationOptions.map((duration) => <option key={duration} value={duration}>{duration} {duration === 1 ? 'hour' : 'hours'}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 text-[hsl(var(--muted-foreground))]" size={15} /></div></label>
          </div>
          {error && <div className="rounded-xl bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-[11px] font-bold text-[hsl(var(--destructive))]">{error}</div>}
          <div className="flex gap-3 pt-2"><button type="button" onClick={onClose} className="focus-ring flex-1 rounded-xl border border-[hsl(var(--border))] py-3 text-[12px] font-extrabold text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-modal">Cancel</button><button type="submit" className="focus-ring flex-[1.5] rounded-xl bg-[hsl(var(--primary))] py-3 text-[12px] font-extrabold text-[hsl(var(--primary-foreground))] shadow-[0_8px_18px_hsl(var(--primary)/.2)] transition-transform hover:-translate-y-0.5" data-testid="button-save-profile"><Check size={15} className="mr-1 inline" />{profile ? 'Save changes' : 'Add profile'}</button></div>
        </form>
      </div>
    </div>
  );
}

function DeleteModal({ profile, onClose, onConfirm }: { profile: Profile; onClose: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-30 flex items-center justify-center bg-[hsl(205_34%_11%/.48)] p-5 backdrop-blur-sm"><div className="animate-rise w-full max-w-[390px] rounded-3xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-7 shadow-[0_24px_80px_hsl(205_34%_11%/.25)]"><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]"><Trash2 size={19} /></div><h2 className="text-[21px] font-extrabold tracking-[-.04em]">Remove this profile?</h2><p className="mt-2 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]"><strong className="text-[hsl(var(--foreground))]">{profile.name}</strong> will be removed from this browser. This cannot be undone.</p><div className="mt-7 flex gap-3"><button type="button" onClick={onClose} className="focus-ring flex-1 rounded-xl border border-[hsl(var(--border))] py-3 text-[12px] font-extrabold text-[hsl(var(--muted-foreground))]" data-testid="button-cancel-delete">Keep it</button><button type="button" onClick={onConfirm} className="focus-ring flex-1 rounded-xl bg-[hsl(var(--destructive))] py-3 text-[12px] font-extrabold text-[hsl(var(--destructive-foreground))]" data-testid="button-confirm-delete">Remove</button></div></div></div>;
}

function Home() {
  const [profiles, setProfiles] = useState<Profile[]>(loadProfiles);
  const [now, setNow] = useState(Date.now());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [modalProfile, setModalProfile] = useState<Profile | null | undefined>(undefined);
  const [deleteProfile, setDeleteProfile] = useState<Profile | null>(null);
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => { const interval = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(interval); }, []);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles)); }, [profiles]);
  useEffect(() => {
    setProfiles((current) => current.map((profile) => profile.status === 'limited' && profile.limitedUntil && profile.limitedUntil <= now ? { ...profile, status: 'ready', limitedUntil: null } : profile));
  }, [now]);

  const filteredProfiles = useMemo(() => profiles.filter((profile) => {
    const text = `${profile.name} ${profile.email} ${profile.ide} ${profile.agent}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (filter === 'all' || profile.status === filter);
  }), [profiles, query, filter]);
  const limitedCount = profiles.filter((p) => p.status === 'limited' && (p.limitedUntil ?? 0) > now).length;
  const readyCount = profiles.length - limitedCount;

  function saveProfile(form: FormState) {
    if (modalProfile) setProfiles((current) => current.map((p) => p.id === modalProfile.id ? { ...p, ...form } : p));
    else setProfiles((current) => [...current, { ...form, id: `p-${Date.now()}`, status: 'ready', limitedUntil: null, createdAt: Date.now() }]);
    setModalProfile(undefined);
  }
  function limitProfile(id: string) { setProfiles((current) => current.map((p) => p.id === id ? { ...p, status: 'limited', limitedUntil: Date.now() + p.duration * 3600000 } : p)); }
  function resetProfile(id: string) { setProfiles((current) => current.map((p) => p.id === id ? { ...p, status: 'ready', limitedUntil: null } : p)); }

  return (
    <div className="app-shell flex text-[hsl(var(--foreground))]">
      <div className="noise" />
      <Sidebar count={profiles.length} onAdd={() => setModalProfile(null)} />
      {mobileNav && <div className="fixed inset-0 z-20 bg-[hsl(205_34%_11%/.35)] md:hidden" onClick={() => setMobileNav(false)}><div className="h-full w-[270px] bg-[hsl(var(--sidebar))] p-5" onClick={(e) => e.stopPropagation()}><AppLogo /><div className="mt-12 mono text-[9px] uppercase tracking-[.2em] text-[hsl(var(--sidebar-foreground)/.42)]">Workspace</div><button onClick={() => { setMobileNav(false); setFilter('all'); }} className="mt-3 flex w-full items-center gap-3 rounded-xl bg-[hsl(var(--sidebar-accent))] px-3 py-3 text-left text-[13px] font-bold text-[hsl(var(--sidebar-foreground))]" data-testid="nav-mobile-profiles"><KeyRound size={16} /> Profiles <span className="mono ml-auto text-[10px] opacity-50">{profiles.length}</span></button></div></div>}
      <main className="min-w-0 flex-1">
        <Topbar onAdd={() => setModalProfile(null)} onMenu={() => setMobileNav(true)} />
        <div className="mx-auto max-w-[1220px] px-5 pb-12 pt-7 sm:px-8 md:px-12 md:pt-12 lg:px-16">
          <div className="animate-rise flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="mono mb-3 flex items-center gap-2 text-[9px] font-medium uppercase tracking-[.2em] text-[hsl(var(--primary))]"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" /> Live workspace</div><h1 className="text-[32px] font-extrabold tracking-[-.065em] sm:text-[40px]">Keep your access <span className="text-[hsl(var(--primary))]">within reach.</span></h1><p className="mt-2 max-w-[500px] text-[13px] leading-relaxed text-[hsl(var(--muted-foreground))]">A quiet place for the accounts, agents, and reset windows that keep your coding flow moving.</p></div><button type="button" onClick={() => setModalProfile(null)} className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 text-[12px] font-extrabold text-[hsl(var(--primary-foreground))] shadow-[0_8px_20px_hsl(var(--primary)/.2)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_24px_hsl(var(--primary)/.27)]" data-testid="button-add-profile"><Plus size={16} strokeWidth={2.8} /> Add profile</button></div>
          <div className="animate-rise animate-rise-1 mt-9 grid gap-3 sm:grid-cols-3">
            <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card)/.7)] p-4"><div className="mono text-[9px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Total profiles</div><div className="mt-2 text-[26px] font-extrabold tracking-[-.05em]" data-testid="stat-total">{profiles.length}</div><KeyRound className="absolute right-4 top-4 text-[hsl(var(--primary)/.28)]" size={19} /></div>
            <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card)/.7)] p-4"><div className="mono text-[9px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Ready now</div><div className="mt-2 text-[26px] font-extrabold tracking-[-.05em] text-[hsl(var(--primary))]" data-testid="stat-ready">{readyCount}</div><Zap className="absolute right-4 top-4 text-[hsl(var(--primary)/.28)]" size={19} /></div>
            <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card)/.7)] p-4"><div className="mono text-[9px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">On cooldown</div><div className="mt-2 text-[26px] font-extrabold tracking-[-.05em] text-[hsl(28_76%_40%)]" data-testid="stat-limited">{limitedCount}</div><Clock3 className="absolute right-4 top-4 text-[hsl(var(--accent)/.55)]" size={19} /></div>
          </div>
          <section className="animate-rise animate-rise-2 mt-10">
            <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-[18px] font-extrabold tracking-[-.035em]">Your profiles</h2><p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">{filteredProfiles.length} connection{filteredProfiles.length === 1 ? '' : 's'} in view</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 text-[hsl(var(--muted-foreground))]" size={15} /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a profile..." className="focus-ring h-9 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card)/.6)] pl-9 pr-3 text-[11px] font-semibold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))] sm:w-[190px]" data-testid="input-search" /></div><div className="flex rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card)/.6)] p-0.5">{(['all', 'ready', 'limited'] as const).map((option) => <button key={option} type="button" onClick={() => setFilter(option)} className={`focus-ring rounded-md px-3 py-1.5 text-[10px] font-extrabold capitalize transition-colors ${filter === option ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`} data-testid={`filter-${option}`}>{option === 'all' ? 'All' : option === 'limited' ? 'Cooldown' : 'Ready'}</button>)}</div></div></div>
            {filteredProfiles.length > 0 ? <div className="grid gap-4 lg:grid-cols-2">{filteredProfiles.map((profile, index) => <div key={profile.id} style={{ animationDelay: `${index * 70}ms` }}><ProfileCard profile={profile} now={now} onEdit={() => setModalProfile(profile)} onDelete={() => setDeleteProfile(profile)} onLimit={() => limitProfile(profile.id)} onReset={() => resetProfile(profile.id)} /></div>)}</div> : <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/.45)] px-6 text-center"><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><KeyRound size={24} /></div><h3 className="text-[16px] font-extrabold tracking-[-.03em]">{profiles.length === 0 ? 'Your control room is quiet' : 'No profiles match that search'}</h3><p className="mt-2 max-w-[300px] text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">{profiles.length === 0 ? 'Add your first AI IDE connection and we will keep an eye on the reset window.' : 'Try a different name, email, IDE, or status filter.'}</p>{profiles.length === 0 && <button type="button" onClick={() => setModalProfile(null)} className="mt-5 rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-[11px] font-extrabold text-[hsl(var(--primary-foreground))]" data-testid="button-empty-add"><Plus size={14} className="mr-1 inline" /> Add first profile</button>}</div>}
          </section>
          <footer className="animate-rise animate-rise-3 mt-12 flex flex-col gap-3 border-t border-[hsl(var(--border)/.7)] pt-5 text-[10px] text-[hsl(var(--muted-foreground))] sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><ShieldCheck size={13} className="text-[hsl(var(--primary))]" /> Local-first · private by design</div><div className="flex items-center gap-4"><span className="mono">v1.0.0</span><div className="flex items-center gap-1" data-testid="text-help"><CircleHelp size={13} /> How it works</div></div></footer>
        </div>
      </main>
      {modalProfile !== undefined && <ProfileModal profile={modalProfile} onClose={() => setModalProfile(undefined)} onSave={saveProfile} />}
      {deleteProfile && <DeleteModal profile={deleteProfile} onClose={() => setDeleteProfile(null)} onConfirm={() => { setProfiles((current) => current.filter((p) => p.id !== deleteProfile.id)); setDeleteProfile(null); }} />}
    </div>
  );
}

function Router() {
  return <Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><RoutedErrorBoundary><Router /></RoutedErrorBoundary></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;