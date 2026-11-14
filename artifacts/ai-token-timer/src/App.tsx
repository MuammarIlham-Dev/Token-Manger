import { type ChangeEvent, type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, Bell, Check, CircleHelp, Clock3,
  Code2, Database, Download, Gauge, History, KeyRound, Laptop2, Mail,
  Menu, MoreHorizontal, Pencil, Plus, Search, Settings2, ShieldCheck,
  Sparkles, TimerReset, Trash2, Upload, X, Zap,
} from 'lucide-react';
import { Route, Switch, Router as WouterRouter, useLocation, useRoute } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { toast } from '@/hooks/use-toast';
import {
  appendActivity, clearActivity, createId, exportBackup, getSnapshot,
  getStorageStatus, importBackup, removeProfileWithActivity,
  requestPersistentStorage, savePreferences, saveProfileWithActivity,
  subscribeToStore, updateProfileWithActivity,
  type ActivityAction, type ActivityEntry, type AppSnapshot, type BackupFile,
  type Preferences, type Profile, type StorageStatus, type TimerKind,
} from '@/lib/local-store';

type StatusFilter = 'all' | 'ready' | 'limited';

function formatDuration(totalMinutes: number) {
  const days = Math.floor(totalMinutes / 1440);
  const minutes = totalMinutes % 1440;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (remainingMinutes || parts.length === 0) parts.push(`${remainingMinutes}m`);
  return parts.join(' ');
}

function formatCountdown(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatBytes(value: number | null) {
  if (value === null) return 'Unavailable';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function initials(value: string) {
  return value.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function timerUntil(profile: Profile, kind: TimerKind) {
  return kind === 'token' ? profile.tokenRefreshUntil : profile.quotaRefreshUntil;
}

function timerDuration(profile: Profile, kind: TimerKind) {
  return kind === 'token' ? profile.tokenRefreshDurationMinutes : profile.quotaRefreshDurationMinutes;
}

function isTimerRunning(profile: Profile, kind: TimerKind, now: number) {
  const until = timerUntil(profile, kind);
  return until !== null && until > now;
}

function profileIsLimited(profile: Profile, now: number) {
  return isTimerRunning(profile, 'token', now) || isTimerRunning(profile, 'quota', now);
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
        <div className="mono mt-0.5 text-[9px] uppercase tracking-[.18em] text-[hsl(var(--sidebar-foreground)/.48)]">local access manager</div>
      </div>
    </div>
  );
}

function ConnectionTree({ profiles, selectedIde, onSelectIde }: {
  profiles: Profile[]; selectedIde: string | null; onSelectIde: (ide: string) => void;
}) {
  const groupedProfiles = useMemo(() => {
    const groups = new Map<string, Map<string, Set<string>>>();
    profiles.forEach((profile) => {
      if (!groups.has(profile.ide)) groups.set(profile.ide, new Map());
      const emails = groups.get(profile.ide)!;
      if (!emails.has(profile.email)) emails.set(profile.email, new Set());
      emails.get(profile.email)!.add(profile.model);
    });
    return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [profiles]);

  return (
    <div className="mt-8 min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="mono mb-3 px-3 text-[9px] font-medium uppercase tracking-[.2em] text-[hsl(var(--sidebar-foreground)/.42)]">Connections</div>
      <div className="space-y-4">
        {groupedProfiles.map(([ide, emails]) => (
          <div key={ide}>
            <button type="button" onClick={() => onSelectIde(ide)} aria-pressed={selectedIde === ide}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[11px] font-extrabold transition-colors ${selectedIde === ide ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))]' : 'text-[hsl(var(--sidebar-foreground)/.86)] hover:bg-[hsl(var(--sidebar-accent)/.65)]'}`}>
              <Laptop2 size={13} className="text-[hsl(var(--sidebar-primary))]" />
              <span className="truncate">{ide}</span>
              <span className="mono ml-auto text-[9px] text-[hsl(var(--sidebar-foreground)/.35)]">{Array.from(emails.values()).reduce((total, models) => total + models.size, 0)}</span>
            </button>
            <div className="ml-[18px] mt-2 space-y-2 border-l border-[hsl(var(--sidebar-border))] pl-3">
              {Array.from(emails.entries()).map(([email, models]) => (
                <div key={`${ide}-${email}`} className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[hsl(var(--sidebar-foreground)/.58)]"><Mail size={11} /><span className="truncate">{email}</span></div>
                  <div className="mt-1.5 space-y-1 pl-[18px]">
                    {Array.from(models).sort().map((model) => (
                      <div key={`${email}-${model}`} className="flex items-center gap-1.5 text-[10px] text-[hsl(var(--sidebar-foreground)/.4)]"><Sparkles size={10} className="shrink-0 text-[hsl(var(--accent))]" /><span className="truncate">{model}</span></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {groupedProfiles.length === 0 && <p className="px-3 text-[10px] leading-relaxed text-[hsl(var(--sidebar-foreground)/.42)]">Add a profile to build your connection map.</p>}
      </div>
    </div>
  );
}

function Sidebar({ profiles, selectedIde, onSelectIde, onAdd, onActivity, onPreferences }: {
  profiles: Profile[]; selectedIde: string | null; onSelectIde: (ide: string) => void;
  onAdd: () => void; onActivity: () => void; onPreferences: () => void;
}) {
  return (
    <aside className="hidden w-[248px] shrink-0 flex-col bg-[hsl(var(--sidebar))] px-5 py-6 text-[hsl(var(--sidebar-foreground))] md:flex">
      <AppLogo />
      <div className="mt-12">
        <div className="mono mb-3 px-3 text-[9px] font-medium uppercase tracking-[.2em] text-[hsl(var(--sidebar-foreground)/.42)]">Workspace</div>
        <nav className="space-y-1">
          <button type="button" onClick={() => onSelectIde(selectedIde ?? '')} className="flex w-full items-center gap-3 rounded-xl bg-[hsl(var(--sidebar-accent))] px-3 py-2.5 text-left text-[13px] font-semibold text-[hsl(var(--sidebar-foreground))]">
            <KeyRound size={16} strokeWidth={2.2} /><span className="flex-1">Profiles</span><span className="mono text-[10px] text-[hsl(var(--sidebar-foreground)/.42)]">{String(profiles.length).padStart(2, '0')}</span>
          </button>
          <button type="button" onClick={onActivity} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-[hsl(var(--sidebar-foreground)/.58)] transition-colors hover:bg-[hsl(var(--sidebar-accent)/.65)] hover:text-[hsl(var(--sidebar-foreground))]">
            <Activity size={16} strokeWidth={1.8} /><span className="flex-1">Activity log</span>
          </button>
        </nav>
      </div>
      <ConnectionTree profiles={profiles} selectedIde={selectedIde} onSelectIde={onSelectIde} />
      <div className="mt-auto">
        <div className="mb-5 rounded-2xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent)/.5)] p-4">
          <div className="mb-3 flex items-center justify-between"><span className="mono text-[9px] uppercase tracking-[.15em] text-[hsl(var(--sidebar-foreground)/.45)]">Browser vault</span><ShieldCheck size={15} className="text-[hsl(var(--sidebar-primary))]" /></div>
          <p className="text-[11px] leading-relaxed text-[hsl(var(--sidebar-foreground)/.6)]">Profiles stay in this browser’s local database. Export a backup to move or protect them.</p>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-[hsl(var(--sidebar-primary))]"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" /> stored on this device</div>
        </div>
        <button type="button" onClick={onPreferences} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[12px] font-semibold text-[hsl(var(--sidebar-foreground)/.57)] transition-colors hover:bg-[hsl(var(--sidebar-accent)/.65)]"><Settings2 size={16} /> Preferences & backups</button>
        <button type="button" onClick={onAdd} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--sidebar-primary))] py-3 text-[12px] font-extrabold text-[hsl(var(--sidebar-primary-foreground))] shadow-[0_10px_24px_hsl(var(--sidebar-primary)/.18)] transition-transform hover:-translate-y-0.5 active:translate-y-0"><Plus size={15} strokeWidth={2.8} /> New profile</button>
      </div>
    </aside>
  );
}

function Topbar({ onAdd, onMenu }: { onAdd: () => void; onMenu: () => void }) {
  return <header className="flex items-center justify-between border-b border-[hsl(var(--border)/.75)] px-5 py-4 md:hidden"><button type="button" onClick={onMenu} className="focus-ring rounded-lg p-1" aria-label="Open menu"><Menu size={21} /></button><AppLogo /><button type="button" onClick={onAdd} className="focus-ring rounded-lg bg-[hsl(var(--primary))] p-2 text-[hsl(var(--primary-foreground))]" aria-label="Add profile"><Plus size={18} /></button></header>;
}

function StatusBadge({ limited }: { limited: boolean }) {
  return limited
    ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--accent)/.18)] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.08em] text-[hsl(28 76% 34%)]"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" /> Cooling down</span>
    : <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--primary)/.12)] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.08em] text-[hsl(var(--primary))]"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" /> Ready</span>;
}

function TimerPanel({ kind, profile, now, onStart, onReset }: {
  kind: TimerKind; profile: Profile; now: number; onStart: () => void; onReset: () => void;
}) {
  const until = timerUntil(profile, kind);
  const duration = timerDuration(profile, kind);
  const remaining = until ? until - now : 0;
  const running = remaining > 0;
  const label = kind === 'token' ? 'Token refresh' : 'Quota reset';
  const progress = running ? Math.min(100, Math.max(2, (remaining / (duration * 60000)) * 100)) : 0;
  return (
    <div className={`rounded-xl p-3.5 ${running ? 'bg-[hsl(var(--accent)/.1)]' : 'bg-[hsl(var(--primary)/.055)]'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className={`flex items-center gap-2 text-[11px] font-extrabold ${running ? 'text-[hsl(28_76%_34%)]' : 'text-[hsl(var(--foreground))]'}`}><Clock3 size={14} />{label}</div>
        {running ? <span className="mono text-[14px] font-medium tracking-[-.04em] text-[hsl(28_76%_30%)]" aria-label={`${label} countdown`}>{formatCountdown(remaining)}</span> : <span className="text-[10px] font-bold text-[hsl(var(--primary))]">Ready · {formatDuration(duration)}</span>}
      </div>
      {running && <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[hsl(var(--accent)/.18)]"><div className="h-full rounded-full bg-[hsl(var(--accent))] transition-[width] duration-1000 ease-linear" style={{ width: `${progress}%` }} /></div>}
      <button type="button" onClick={running ? onReset : onStart} className={`focus-ring mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-extrabold transition-colors ${running ? 'text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/.09)]' : 'text-[hsl(var(--accent-foreground))] hover:bg-[hsl(var(--accent)/.15)]'}`}>
        {running ? <><TimerReset size={13} /> Reset {kind} timer</> : <><AlertTriangle size={13} /> Start {kind} timer</>}
      </button>
    </div>
  );
}

function ProfileCard({ profile, now, onEdit, onDelete, onStartTimer, onResetTimer }: {
  profile: Profile; now: number; onEdit: () => void; onDelete: () => void;
  onStartTimer: (kind: TimerKind) => void; onResetTimer: (kind: TimerKind) => void;
}) {
  const limited = profileIsLimited(profile, now);
  return (
    <article className={`card-shadow animate-rise group relative overflow-hidden rounded-2xl border bg-[hsl(var(--card))] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_44px_hsl(205_30%_22%/.12)] ${limited ? 'border-[hsl(var(--accent)/.48)]' : 'border-[hsl(var(--card-border))]'}`}>
      {limited && <div className="scan-line" />}
      <div className="relative p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] text-[12px] font-extrabold ${limited ? 'bg-[hsl(var(--accent)/.18)] text-[hsl(28_76%_34%)]' : 'bg-[hsl(var(--primary)/.13)] text-[hsl(var(--primary))]'}`}>{initials(profile.name)}</div>
            <div className="min-w-0"><h3 className="truncate text-[15px] font-extrabold tracking-[-.02em]">{profile.name}</h3><div className="mt-1 flex items-center gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]"><Laptop2 size={12} /> {profile.ide}</div></div>
          </div>
          <div className="flex items-center gap-1"><StatusBadge limited={limited} /><button type="button" onClick={onEdit} className="focus-ring ml-1 rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] opacity-60 transition-all hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] group-hover:opacity-100" aria-label={`Edit ${profile.name}`}><MoreHorizontal size={17} /></button></div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-y border-[hsl(var(--border)/.7)] py-4">
          <div className="min-w-0"><div className="mono mb-1.5 text-[9px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">LLM / model</div><div className="flex items-center gap-1.5 truncate text-[12px] font-bold"><Sparkles size={13} className="shrink-0 text-[hsl(var(--accent))]" />{profile.model}</div></div>
          <div className="min-w-0"><div className="mono mb-1.5 text-[9px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Email</div><div className="flex min-w-0 items-center gap-1.5 truncate text-[12px] font-semibold text-[hsl(var(--muted-foreground))]"><Mail size={12} /><span className="truncate">{profile.email}</span></div></div>
          {profile.accountId && <div className="col-span-2 min-w-0"><div className="mono mb-1.5 text-[9px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Account ID</div><div className="truncate text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">{profile.accountId}</div></div>}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <TimerPanel kind="token" profile={profile} now={now} onStart={() => onStartTimer('token')} onReset={() => onResetTimer('token')} />
          <TimerPanel kind="quota" profile={profile} now={now} onStart={() => onStartTimer('quota')} onReset={() => onResetTimer('quota')} />
        </div>
        <div className="mt-3 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button type="button" onClick={onEdit} className="focus-ring rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="Edit profile"><Pencil size={14} /></button>
          <button type="button" onClick={onDelete} className="focus-ring rounded-lg p-1.5 text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/.1)]" aria-label="Delete profile"><Trash2 size={14} /></button>
        </div>
      </div>
    </article>
  );
}

type FormState = {
  ide: string;
  name: string;
  accountId: string;
  email: string;
  model: string;
  tokenDays: number;
  tokenMinutes: number;
  quotaDays: number;
  quotaMinutes: number;
};

const blankForm: FormState = {
  ide: '', name: '', accountId: '', email: '', model: '',
  tokenDays: 0, tokenMinutes: 60, quotaDays: 0, quotaMinutes: 60,
};

function DurationFields({ label, days, minutes, onDays, onMinutes, testId }: {
  label: string; days: number; minutes: number; onDays: (value: number) => void;
  onMinutes: (value: number) => void; testId: string;
}) {
  return (
    <div>
      <span className="mono mb-2 block text-[9px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">{label}</span>
      <div className="grid grid-cols-2 gap-3">
        <label className="relative block"><span className="sr-only">{label} days</span><input type="number" min="0" max="365000" step="1" value={days} onChange={(event) => onDays(Number(event.target.value))} className="focus-ring h-10 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] px-3 pr-12 text-[12px] font-bold" data-testid={`${testId}-days`} /><span className="pointer-events-none absolute right-3 top-3 text-[10px] font-bold text-[hsl(var(--muted-foreground))]">days</span></label>
        <label className="relative block"><span className="sr-only">{label} minutes</span><input type="number" min="0" max="1439" step="1" value={minutes} onChange={(event) => onMinutes(Number(event.target.value))} className="focus-ring h-10 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] px-3 pr-16 text-[12px] font-bold" data-testid={`${testId}-minutes`} /><span className="pointer-events-none absolute right-3 top-3 text-[10px] font-bold text-[hsl(var(--muted-foreground))]">minutes</span></label>
      </div>
    </div>
  );
}

function ProfileModal({ profile, onClose, onSave }: {
  profile: Profile | null; onClose: () => void; onSave: (form: FormState) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(profile ? {
    ide: profile.ide, name: profile.name, accountId: profile.accountId,
    email: profile.email, model: profile.model,
    tokenDays: Math.floor(profile.tokenRefreshDurationMinutes / 1440),
    tokenMinutes: profile.tokenRefreshDurationMinutes % 1440,
    quotaDays: Math.floor(profile.quotaRefreshDurationMinutes / 1440),
    quotaMinutes: profile.quotaRefreshDurationMinutes % 1440,
  } : blankForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const update = (key: keyof FormState, value: string | number) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.ide.trim() || !form.name.trim() || !form.email.trim() || !form.model.trim()) {
      setError('Fill in the IDE, profile name, email, and model to continue.');
      return;
    }
    const durations = [form.tokenDays, form.tokenMinutes, form.quotaDays, form.quotaMinutes];
    if (durations.some((value) => !Number.isSafeInteger(value) || value < 0)
      || form.tokenDays > 365000 || form.quotaDays > 365000
      || form.tokenMinutes > 1439 || form.quotaMinutes > 1439
      || (form.tokenDays === 0 && form.tokenMinutes === 0)
      || (form.quotaDays === 0 && form.quotaMinutes === 0)) {
      setError('Each timer needs a duration of at least one minute. Minutes must be between 0 and 1439.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSave({ ...form, ide: form.ide.trim(), name: form.name.trim(), accountId: form.accountId.trim(), email: form.email.trim(), model: form.model.trim() });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-[hsl(205_34%_11%/.48)] p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
      <div className="animate-rise max-h-[94dvh] w-full max-w-[680px] overflow-y-auto rounded-t-3xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-[0_24px_80px_hsl(205_34%_11%/.25)] sm:rounded-3xl sm:p-8">
        <div className="mb-7 flex items-start justify-between"><div><div className="mono mb-2 text-[9px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">{profile ? 'Update profile' : 'New access profile'}</div><h2 id="profile-modal-title" className="text-[25px] font-extrabold tracking-[-.05em]">{profile ? 'Tune this connection' : 'Add an account and its timers'}</h2><p className="mt-1.5 text-[12px] text-[hsl(var(--muted-foreground))]">Set independent token refresh and quota reset windows.</p></div><button type="button" onClick={onClose} className="focus-ring rounded-xl p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="Close"><X size={18} /></button></div>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mono mb-2 block text-[9px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">IDE / app</span><div className="relative"><Code2 className="pointer-events-none absolute left-3 top-3.5 text-[hsl(var(--muted-foreground))]" size={15} /><input value={form.ide} onChange={(event) => update('ide', event.target.value)} placeholder="e.g. Cursor" className="focus-ring h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] pl-10 pr-3 text-[12px] font-bold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))]" /></div></label>
            <label className="block"><span className="mono mb-2 block text-[9px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Profile name</span><input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="e.g. Main build account" className="focus-ring h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] px-3 text-[12px] font-bold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))]" /></label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mono mb-2 block text-[9px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Email identity</span><div className="relative"><Mail className="pointer-events-none absolute left-3 top-3.5 text-[hsl(var(--muted-foreground))]" size={15} /><input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="you@example.com" className="focus-ring h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] px-10 text-[12px] font-bold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))]" /></div></label>
            <label className="block"><span className="mono mb-2 block text-[9px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Account ID <span className="normal-case tracking-normal">(optional)</span></span><input value={form.accountId} onChange={(event) => update('accountId', event.target.value)} placeholder="e.g. workspace or account ID" className="focus-ring h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] px-3 text-[12px] font-bold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))]" /></label>
          </div>
          <label className="block"><span className="mono mb-2 block text-[9px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">LLM / model</span><input value={form.model} onChange={(event) => update('model', event.target.value)} placeholder="e.g. Claude, GPT-4.1, Gemini" className="focus-ring h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] px-3 text-[12px] font-bold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))]" /></label>
          <div className="grid gap-4 rounded-2xl border border-[hsl(var(--border)/.7)] bg-[hsl(var(--background)/.4)] p-4 sm:grid-cols-2">
            <DurationFields label="Token refresh window" days={form.tokenDays} minutes={form.tokenMinutes} onDays={(value) => update('tokenDays', value)} onMinutes={(value) => update('tokenMinutes', value)} testId="input-token-duration" />
            <DurationFields label="Quota reset window" days={form.quotaDays} minutes={form.quotaMinutes} onDays={(value) => update('quotaDays', value)} onMinutes={(value) => update('quotaMinutes', value)} testId="input-quota-duration" />
          </div>
          <p className="-mt-3 text-[10px] text-[hsl(var(--muted-foreground))]">Timers start when you press their Start button. This app does not read provider usage automatically.</p>
          {error && <div role="alert" className="rounded-xl bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-[11px] font-bold text-[hsl(var(--destructive))]">{error}</div>}
          <div className="flex gap-3 pt-1"><button type="button" onClick={onClose} className="focus-ring flex-1 rounded-xl border border-[hsl(var(--border))] py-3 text-[12px] font-extrabold text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))]">Cancel</button><button type="submit" disabled={saving} className="focus-ring flex-[1.5] rounded-xl bg-[hsl(var(--primary))] py-3 text-[12px] font-extrabold text-[hsl(var(--primary-foreground))] shadow-[0_8px_18px_hsl(var(--primary)/.2)] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"><Check size={15} className="mr-1 inline" />{saving ? 'Saving…' : profile ? 'Save changes' : 'Add profile'}</button></div>
        </form>
      </div>
    </div>
  );
}

function DeleteModal({ profile, onClose, onConfirm }: { profile: Profile; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false);
  async function confirm() {
    setDeleting(true);
    try { await onConfirm(); } catch (error) {
      toast({ title: 'Could not remove profile', description: error instanceof Error ? error.message : 'Local storage failed.' });
    } finally { setDeleting(false); }
  }
  return <div className="fixed inset-0 z-30 flex items-center justify-center bg-[hsl(205_34%_11%/.48)] p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div className="animate-rise w-full max-w-[390px] rounded-3xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-7 shadow-[0_24px_80px_hsl(205_34%_11%/.25)]"><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]"><Trash2 size={19} /></div><h2 id="delete-title" className="text-[21px] font-extrabold tracking-[-.04em]">Remove this profile?</h2><p className="mt-2 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]"><strong className="text-[hsl(var(--foreground))]">{profile.name}</strong> and its timers will be removed from this browser.</p><div className="mt-7 flex gap-3"><button type="button" onClick={onClose} className="focus-ring flex-1 rounded-xl border border-[hsl(var(--border))] py-3 text-[12px] font-extrabold text-[hsl(var(--muted-foreground))]">Keep it</button><button type="button" onClick={() => void confirm()} disabled={deleting} className="focus-ring flex-1 rounded-xl bg-[hsl(var(--destructive))] py-3 text-[12px] font-extrabold text-[hsl(var(--destructive-foreground))] disabled:opacity-60">{deleting ? 'Removing…' : 'Remove'}</button></div></div></div>;
}

function ActivityModal({ entries, onClose, onClear }: { entries: ActivityEntry[]; onClose: () => void; onClear: () => Promise<void> }) {
  const [clearing, setClearing] = useState(false);
  async function clear() {
    setClearing(true);
    try { await onClear(); }
    catch (error) { toast({ title: 'Could not clear activity', description: error instanceof Error ? error.message : 'Local storage failed.' }); }
    finally { setClearing(false); }
  }
  function describe(entry: ActivityEntry) {
    switch (entry.action) {
      case 'profile-added': return 'Profile added';
      case 'profile-updated': return 'Profile updated';
      case 'profile-deleted': return 'Profile removed';
      case 'timer-started': return `${entry.timerKind === 'token' ? 'Token refresh' : 'Quota reset'} timer started`;
      case 'timer-reset': return `${entry.timerKind === 'token' ? 'Token refresh' : 'Quota reset'} timer reset`;
      case 'timer-expired': return `${entry.timerKind === 'token' ? 'Token refresh' : 'Quota reset'} timer completed`;
      case 'backup-imported': return 'Backup imported';
    }
  }
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[hsl(205_34%_11%/.48)] p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="activity-title">
      <div className="animate-rise max-h-[88dvh] w-full max-w-[620px] overflow-y-auto rounded-t-3xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-[0_24px_80px_hsl(205_34%_11%/.25)] sm:rounded-3xl sm:p-8">
        <div className="mb-6 flex items-start justify-between"><div><div className="mono mb-2 text-[9px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">Local history</div><h2 id="activity-title" className="text-[24px] font-extrabold tracking-[-.05em]">Activity log</h2><p className="mt-1.5 text-[12px] text-[hsl(var(--muted-foreground))]">The latest 500 profile and timer changes on this device.</p></div><button type="button" onClick={onClose} className="focus-ring rounded-xl p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="Close activity log"><X size={18} /></button></div>
        {entries.length ? <div className="divide-y divide-[hsl(var(--border)/.7)] rounded-xl border border-[hsl(var(--border)/.7)]">{entries.map((entry) => <div key={entry.id} className="flex items-start gap-3 px-4 py-3"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/.09)] text-[hsl(var(--primary))]"><History size={15} /></div><div className="min-w-0 flex-1"><div className="text-[12px] font-bold">{describe(entry)}</div><div className="truncate text-[11px] text-[hsl(var(--muted-foreground))]">{entry.profileName}</div></div><time className="shrink-0 text-[10px] text-[hsl(var(--muted-foreground))]" dateTime={new Date(entry.occurredAt).toISOString()}>{new Date(entry.occurredAt).toLocaleString()}</time></div>)}</div> : <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-8 text-center text-[12px] text-[hsl(var(--muted-foreground))]">No activity yet. Profile and timer changes will appear here.</div>}
        <div className="mt-5 flex justify-end"><button type="button" onClick={() => void clear()} disabled={!entries.length || clearing} className="focus-ring rounded-lg px-3 py-2 text-[11px] font-bold text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/.08)] disabled:cursor-not-allowed disabled:opacity-40">{clearing ? 'Clearing…' : 'Clear history'}</button></div>
      </div>
    </div>
  );
}

function PreferencesModal({ preferences, storageStatus, onClose, onNotificationsChange, onRequestStorage, onExport, onImport }: {
  preferences: Preferences; storageStatus: StorageStatus | null; onClose: () => void;
  onNotificationsChange: (enabled: boolean) => Promise<void>;
  onRequestStorage: () => Promise<void>; onExport: () => Promise<void>; onImport: (file: File) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const notificationSupported = typeof window !== 'undefined' && 'Notification' in window;
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); }
    catch (error) { toast({ title: 'Could not update preferences', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setBusy(false); }
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await run(() => onImport(file));
    event.target.value = '';
  }
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[hsl(205_34%_11%/.48)] p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="preferences-title">
      <div className="animate-rise max-h-[90dvh] w-full max-w-[560px] overflow-y-auto rounded-t-3xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-[0_24px_80px_hsl(205_34%_11%/.25)] sm:rounded-3xl sm:p-8">
        <div className="mb-6 flex items-start justify-between"><div><div className="mono mb-2 text-[9px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">On this device</div><h2 id="preferences-title" className="text-[24px] font-extrabold tracking-[-.05em]">Preferences & backups</h2><p className="mt-1.5 text-[12px] text-[hsl(var(--muted-foreground))]">Your profiles never leave this browser.</p></div><button type="button" onClick={onClose} className="focus-ring rounded-xl p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="Close preferences"><X size={18} /></button></div>
        <section className="rounded-2xl border border-[hsl(var(--border)/.7)] p-4"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><Bell size={17} /></div><div className="min-w-0 flex-1"><h3 className="text-[12px] font-extrabold">Timer notifications</h3><p className="mt-1 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">Notify when a timer ends while this app is open. Browser notifications require permission.</p></div><input aria-label="Enable timer notifications" type="checkbox" checked={preferences.notificationsEnabled} disabled={!notificationSupported || busy} onChange={(event) => void run(() => onNotificationsChange(event.target.checked))} className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" /></div>{!notificationSupported && <p className="mt-3 text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">Notifications are not available in this browser.</p>}</section>
        <section className="mt-3 rounded-2xl border border-[hsl(var(--border)/.7)] p-4"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><Database size={17} /></div><div className="min-w-0 flex-1"><h3 className="text-[12px] font-extrabold">Browser storage</h3><p className="mt-1 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">{storageStatus?.persisted === true ? 'The browser granted persistent storage.' : storageStatus?.persisted === false ? 'Storage is best-effort and may be cleared by the browser under storage pressure.' : 'Storage persistence status is not available here.'}</p><p className="mt-2 text-[10px] text-[hsl(var(--muted-foreground))]">Used {formatBytes(storageStatus?.usage ?? null)}{storageStatus?.quota ? ` of ${formatBytes(storageStatus.quota)}` : ''}</p></div><button type="button" disabled={busy || storageStatus?.persisted === true || storageStatus?.persisted === null} onClick={() => void run(onRequestStorage)} className="focus-ring rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-[10px] font-bold hover:bg-[hsl(var(--muted))] disabled:opacity-40">{storageStatus?.persisted ? 'Protected' : 'Request'}</button></div></section>
        <section className="mt-3 rounded-2xl border border-[hsl(var(--border)/.7)] p-4"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><Download size={17} /></div><div className="min-w-0 flex-1"><h3 className="text-[12px] font-extrabold">Back up or restore</h3><p className="mt-1 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">Export a JSON backup regularly. Import merges records by ID and keeps profiles that are already here. You can also import a saved JSON response from the older <code>/api/profiles</code> endpoint.</p></div></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void run(onExport)} className="focus-ring inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-3.5 py-2.5 text-[11px] font-extrabold text-[hsl(var(--primary-foreground))] disabled:opacity-50"><Download size={14} /> Export backup</button><label className={`focus-ring inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[hsl(var(--border))] px-3.5 py-2.5 text-[11px] font-extrabold hover:bg-[hsl(var(--muted))] ${busy ? 'pointer-events-none opacity-50' : ''}`}><Upload size={14} /> Import backup<input type="file" accept="application/json,.json" onChange={(event) => void chooseFile(event)} className="sr-only" disabled={busy} /></label></div></section>
        <p className="mt-4 text-[10px] leading-relaxed text-[hsl(var(--muted-foreground))]">Browser site data can be deleted by you or the browser. Backups are plain JSON, so keep them somewhere private. This app does not encrypt profile details.</p>
      </div>
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return <div className="fixed inset-0 z-40 flex items-end justify-center bg-[hsl(205_34%_11%/.48)] p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="help-title"><div className="animate-rise w-full max-w-[500px] rounded-t-3xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-[0_24px_80px_hsl(205_34%_11%/.25)] sm:rounded-3xl sm:p-8"><div className="mb-5 flex items-start justify-between"><div><div className="mono mb-2 text-[9px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">How it works</div><h2 id="help-title" className="text-[23px] font-extrabold tracking-[-.05em]">Your timers, explained</h2></div><button type="button" onClick={onClose} className="focus-ring rounded-xl p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="Close help"><X size={18} /></button></div><div className="space-y-3 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]"><p>Each profile has separate token refresh and quota reset durations. Start either timer when you hit its limit; reset it early if the provider makes the account available again.</p><p>Countdowns use saved end timestamps and your device clock. They catch up after a reload or sleep. Changing the device clock changes the displayed remaining time.</p><p>Profiles and history are stored in IndexedDB for this site in this browser. They are not synced or encrypted. Export a backup before clearing browser site data or changing devices.</p><p>Token Manager is a manual tracker. It does not sign in to providers or read actual usage and quota information.</p></div><button type="button" onClick={onClose} className="focus-ring mt-6 w-full rounded-xl bg-[hsl(var(--primary))] py-3 text-[12px] font-extrabold text-[hsl(var(--primary-foreground))]">Got it</button></div></div>;
}

function Home() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({ notificationsEnabled: false });
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [modalProfile, setModalProfile] = useState<Profile | null | undefined>(undefined);
  const [profileToDelete, setProfileToDelete] = useState<Profile | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const handledExpirations = useRef(new Set<string>());
  const pageStartedAt = useRef(Date.now());
  const [, navigate] = useLocation();
  const [ideRouteMatch, ideRouteParams] = useRoute('/ide/:ide');
  let selectedIde: string | null = null;
  if (ideRouteMatch && ideRouteParams?.ide) {
    try { selectedIde = decodeURIComponent(ideRouteParams.ide); } catch { selectedIde = ideRouteParams.ide; }
  }

  const reloadData = useCallback(async () => {
    const snapshot: AppSnapshot = await getSnapshot();
    setProfiles(snapshot.profiles);
    setActivity(snapshot.activity);
    setPreferences(snapshot.preferences);
    setStorageError('');
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [snapshot, status] = await Promise.all([getSnapshot(), getStorageStatus()]);
        if (!mounted) return;
        setProfiles(snapshot.profiles);
        setActivity(snapshot.activity);
        setPreferences(snapshot.preferences);
        setStorageStatus(status);
        setStorageError('');
      } catch (error) {
        if (mounted) setStorageError(error instanceof Error ? error.message : 'Could not open this browser’s local database.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    const unsubscribe = subscribeToStore(() => { void reloadData().catch((error) => setStorageError(error instanceof Error ? error.message : 'Could not read local data.')); });
    return () => { mounted = false; unsubscribe(); };
  }, [reloadData]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    const onResume = () => setNow(Date.now());
    window.addEventListener('focus', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', onResume); document.removeEventListener('visibilitychange', onResume); };
  }, []);

  useEffect(() => {
    activity.forEach((entry) => {
      if (entry.action === 'timer-expired' && entry.profileId && entry.timerKind && entry.timerEndsAt) {
        handledExpirations.current.add(`${entry.profileId}:${entry.timerKind}:${entry.timerEndsAt}`);
      }
    });
  }, [activity]);

  useEffect(() => {
    if (loading) return;
    profiles.forEach((profile) => {
      (['token', 'quota'] as const).forEach((kind) => {
        const until = timerUntil(profile, kind);
        if (!until || until > now) return;
        const key = `${profile.id}:${kind}:${until}`;
        if (handledExpirations.current.has(key)) return;
        handledExpirations.current.add(key);
        const entry: ActivityEntry = {
          id: `expired:${profile.id}:${kind}:${until}`, profileId: profile.id, profileName: profile.name,
          action: 'timer-expired', timerKind: kind, timerEndsAt: until, occurredAt: now,
        };
        void appendActivity(entry).catch((error) => toast({ title: 'Could not save timer activity', description: error instanceof Error ? error.message : 'Local storage failed.' }));
        if (preferences.notificationsEnabled && until >= pageStartedAt.current && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('Token Manager · Ready', { body: `${profile.name}: ${kind === 'token' ? 'token refresh' : 'quota reset'} timer completed.` });
          } catch {
            // Notification delivery can fail when the browser revokes permission mid-session.
          }
        }
      });
    });
  }, [activity, loading, now, preferences.notificationsEnabled, profiles]);

  const filteredProfiles = useMemo(() => profiles.filter((profile) => {
    const text = `${profile.name} ${profile.accountId} ${profile.email} ${profile.ide} ${profile.model}`.toLowerCase();
    const limited = profileIsLimited(profile, now);
    return text.includes(query.trim().toLowerCase())
      && (!selectedIde || profile.ide === selectedIde)
      && (filter === 'all' || (filter === 'limited' ? limited : !limited));
  }), [profiles, query, selectedIde, filter, now]);
  const limitedCount = profiles.filter((profile) => profileIsLimited(profile, now)).length;
  const readyCount = profiles.length - limitedCount;

  async function saveProfile(form: FormState) {
    const existing = modalProfile && profiles.find((profile) => profile.id === modalProfile.id);
    const profile: Profile = {
      id: existing?.id ?? createId(),
      ide: form.ide, name: form.name, accountId: form.accountId,
      email: form.email, model: form.model,
      tokenRefreshDurationMinutes: form.tokenDays * 1440 + form.tokenMinutes,
      quotaRefreshDurationMinutes: form.quotaDays * 1440 + form.quotaMinutes,
      tokenRefreshUntil: existing?.tokenRefreshUntil ?? null,
      quotaRefreshUntil: existing?.quotaRefreshUntil ?? null,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    const action: ActivityAction = existing ? 'profile-updated' : 'profile-added';
    const entry: ActivityEntry = { id: createId(), profileId: profile.id, profileName: profile.name, action, occurredAt: Date.now() };
    if (existing) {
      await updateProfileWithActivity(profile.id, {
        ide: profile.ide, name: profile.name, accountId: profile.accountId,
        email: profile.email, model: profile.model,
        tokenRefreshDurationMinutes: profile.tokenRefreshDurationMinutes,
        quotaRefreshDurationMinutes: profile.quotaRefreshDurationMinutes,
      }, entry);
    } else {
      await saveProfileWithActivity(profile, entry);
    }
    await reloadData();
    setModalProfile(undefined);
    toast({ title: existing ? 'Profile updated' : 'Profile added', description: `${profile.name} is saved in this browser.` });
  }

  async function startTimer(profile: Profile, kind: TimerKind) {
    const until = Date.now() + timerDuration(profile, kind) * 60_000;
    const entry: ActivityEntry = { id: createId(), profileId: profile.id, profileName: profile.name, action: 'timer-started', timerKind: kind, timerEndsAt: until, occurredAt: Date.now() };
    await updateProfileWithActivity(profile.id, { [kind === 'token' ? 'tokenRefreshUntil' : 'quotaRefreshUntil']: until }, entry);
    await reloadData();
    toast({ title: `${kind === 'token' ? 'Token' : 'Quota'} timer started`, description: `${profile.name} · ${formatDuration(timerDuration(profile, kind))}` });
  }

  async function resetTimer(profile: Profile, kind: TimerKind) {
    const entry: ActivityEntry = { id: createId(), profileId: profile.id, profileName: profile.name, action: 'timer-reset', timerKind: kind, occurredAt: Date.now() };
    await updateProfileWithActivity(profile.id, { [kind === 'token' ? 'tokenRefreshUntil' : 'quotaRefreshUntil']: null }, entry);
    await reloadData();
    toast({ title: `${kind === 'token' ? 'Token' : 'Quota'} timer reset`, description: `${profile.name} is ready.` });
  }

  async function deleteProfile() {
    if (!profileToDelete) return;
    const profile = profileToDelete;
    await removeProfileWithActivity(profile, { id: createId(), profileId: profile.id, profileName: profile.name, action: 'profile-deleted', occurredAt: Date.now() });
    await reloadData();
    setProfileToDelete(null);
    toast({ title: 'Profile removed', description: `${profile.name} was removed from this browser.` });
  }

  async function changeNotifications(enabled: boolean) {
    if (enabled) {
      if (!('Notification' in window)) throw new Error('Notifications are not supported in this browser.');
      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (permission !== 'granted') throw new Error('Browser notification permission was not granted.');
    }
    const next = { ...preferences, notificationsEnabled: enabled };
    await savePreferences(next);
    setPreferences(next);
    toast({ title: enabled ? 'Timer notifications enabled' : 'Timer notifications disabled', description: 'Notifications can appear while Token Manager is open.' });
  }

  async function refreshStorageStatus() {
    const granted = await requestPersistentStorage();
    setStorageStatus(await getStorageStatus());
    toast({ title: granted ? 'Persistent storage granted' : 'Persistent storage not granted', description: granted ? 'The browser will avoid automatic storage eviction when possible.' : 'Export backups regularly to protect your data.' });
  }

  async function downloadBackup() {
    const backup: BackupFile = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `token-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast({ title: 'Backup exported', description: `${backup.profiles.length} profiles saved to a JSON file.` });
  }

  async function restoreBackup(file: File) {
    const contents = JSON.parse(await file.text()) as unknown;
    const result = await importBackup(contents);
    await reloadData();
    toast({ title: 'Backup imported', description: `${result.profiles} profiles merged into this browser.` });
  }

  function selectIde(ide: string) {
    setMobileNav(false);
    navigate(selectedIde === ide || ide === '' ? '/' : `/ide/${encodeURIComponent(ide)}`);
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))]"><div className="flex items-center gap-3 text-[12px] font-bold text-[hsl(var(--muted-foreground))]"><span className="pulse-dot h-2 w-2 rounded-full bg-[hsl(var(--primary))]" /> Opening your local vault…</div></div>;
  }

  if (storageError) {
    return <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))] p-5"><div className="max-w-md rounded-2xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--card))] p-7 text-center"><Database className="mx-auto mb-3 text-[hsl(var(--destructive))]" /><h1 className="text-lg font-extrabold">Could not open local storage</h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{storageError}</p><p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Enable site storage in your browser, then try again. Your data stays in this browser.</p><button type="button" onClick={() => { setLoading(true); void reloadData().then(() => setLoading(false)).catch((error) => { setStorageError(error instanceof Error ? error.message : 'Could not read local data.'); setLoading(false); }); }} className="mt-5 rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-extrabold text-[hsl(var(--primary-foreground))]">Try again</button></div></div>;
  }

  return (
    <div className="app-shell flex text-[hsl(var(--foreground))]">
      <div className="noise" />
      <Sidebar profiles={profiles} selectedIde={selectedIde} onSelectIde={selectIde} onAdd={() => setModalProfile(null)} onActivity={() => setShowActivity(true)} onPreferences={() => setShowPreferences(true)} />
      {mobileNav && (
        <div className="fixed inset-0 z-20 bg-[hsl(205_34%_11%/.35)] md:hidden" onClick={() => setMobileNav(false)}>
          <div className="flex h-full w-[270px] flex-col bg-[hsl(var(--sidebar))] p-5" onClick={(event) => event.stopPropagation()}>
            <AppLogo />
            <div className="mt-12 mono text-[9px] uppercase tracking-[.2em] text-[hsl(var(--sidebar-foreground)/.42)]">Workspace</div>
            <button type="button" onClick={() => { setMobileNav(false); setFilter('all'); navigate('/'); }} className={`mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-bold text-[hsl(var(--sidebar-foreground))] ${selectedIde === null ? 'bg-[hsl(var(--sidebar-accent))]' : 'hover:bg-[hsl(var(--sidebar-accent)/.65)]'}`}>
              <KeyRound size={16} /> Profiles <span className="mono ml-auto text-[10px] opacity-50">{profiles.length}</span>
            </button>
            <button type="button" onClick={() => { setMobileNav(false); setShowActivity(true); }} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-bold text-[hsl(var(--sidebar-foreground)/.75)] hover:bg-[hsl(var(--sidebar-accent)/.65)]"><Activity size={16} /> Activity log</button>
            <ConnectionTree profiles={profiles} selectedIde={selectedIde} onSelectIde={selectIde} />
            <button type="button" onClick={() => { setMobileNav(false); setShowPreferences(true); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[12px] font-semibold text-[hsl(var(--sidebar-foreground)/.65)]"><Settings2 size={16} /> Preferences & backups</button>
          </div>
        </div>
      )}
      <main className="min-w-0 flex-1">
        <Topbar onAdd={() => setModalProfile(null)} onMenu={() => setMobileNav(true)} />
        <div className="mx-auto max-w-[1220px] px-5 pb-12 pt-7 sm:px-8 md:px-12 md:pt-12 lg:px-16">
          <div className="animate-rise flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="mono mb-3 flex items-center gap-2 text-[9px] font-medium uppercase tracking-[.2em] text-[hsl(var(--primary))]"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" /> {selectedIde ? 'Dedicated IDE workspace' : 'Local workspace'}</div><h1 className="text-[32px] font-extrabold tracking-[-.065em] sm:text-[40px]">{selectedIde ? <>{selectedIde} <span className="text-[hsl(var(--primary))]">workspace.</span></> : <>Keep your access <span className="text-[hsl(var(--primary))]">within reach.</span></>}</h1><p className="mt-2 max-w-[520px] text-[13px] leading-relaxed text-[hsl(var(--muted-foreground))]">Track independent token refresh and quota reset timers for every account and model you use.</p></div><div className="flex flex-wrap gap-2">{selectedIde && <button type="button" onClick={() => navigate('/')} className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.65)] px-4 text-[12px] font-extrabold text-[hsl(var(--muted-foreground))] transition-all hover:-translate-y-0.5 hover:bg-[hsl(var(--muted))]">All IDEs</button>}<button type="button" onClick={() => setModalProfile(null)} className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 text-[12px] font-extrabold text-[hsl(var(--primary-foreground))] shadow-[0_8px_20px_hsl(var(--primary)/.2)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_24px_hsl(var(--primary)/.27)]"><Plus size={16} strokeWidth={2.8} /> Add profile</button></div></div>
          <div className="animate-rise animate-rise-1 mt-9 grid gap-3 sm:grid-cols-3">
            <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card)/.7)] p-4"><div className="mono text-[9px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Total profiles</div><div className="mt-2 text-[26px] font-extrabold tracking-[-.05em]">{profiles.length}</div><KeyRound className="absolute right-4 top-4 text-[hsl(var(--primary)/.28)]" size={19} /></div>
            <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card)/.7)] p-4"><div className="mono text-[9px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Ready now</div><div className="mt-2 text-[26px] font-extrabold tracking-[-.05em] text-[hsl(var(--primary))]">{readyCount}</div><Zap className="absolute right-4 top-4 text-[hsl(var(--primary)/.28)]" size={19} /></div>
            <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card)/.7)] p-4"><div className="mono text-[9px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Cooling down</div><div className="mt-2 text-[26px] font-extrabold tracking-[-.05em] text-[hsl(28_76%_40%)]">{limitedCount}</div><Clock3 className="absolute right-4 top-4 text-[hsl(var(--accent)/.55)]" size={19} /></div>
          </div>
          <section className="animate-rise animate-rise-2 mt-10">
            <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><h2 className="text-[18px] font-extrabold tracking-[-.035em]">Your profiles</h2>{selectedIde && <span className="rounded-full bg-[hsl(var(--primary)/.1)] px-2.5 py-1 text-[10px] font-extrabold text-[hsl(var(--primary))]">{selectedIde}</span>}</div><p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">{filteredProfiles.length} connection{filteredProfiles.length === 1 ? '' : 's'} in view{selectedIde ? ` · ${selectedIde}` : ''}</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 text-[hsl(var(--muted-foreground))]" size={15} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a profile…" className="focus-ring h-9 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card)/.6)] pl-9 pr-3 text-[11px] font-semibold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))] sm:w-[190px]" /></div><div className="flex rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card)/.6)] p-0.5">{(['all', 'ready', 'limited'] as const).map((option) => <button key={option} type="button" onClick={() => setFilter(option)} className={`focus-ring rounded-md px-3 py-1.5 text-[10px] font-extrabold capitalize transition-colors ${filter === option ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}>{option === 'all' ? 'All' : option === 'limited' ? 'Cooldown' : 'Ready'}</button>)}</div></div></div>
            {filteredProfiles.length > 0 ? <div className="grid gap-4 lg:grid-cols-2">{filteredProfiles.map((profile, index) => <div key={profile.id} style={{ animationDelay: `${index * 70}ms` }}><ProfileCard profile={profile} now={now} onEdit={() => setModalProfile(profile)} onDelete={() => setProfileToDelete(profile)} onStartTimer={(kind) => void startTimer(profile, kind).catch((error) => toast({ title: 'Could not start timer', description: error instanceof Error ? error.message : 'Local storage failed.' }))} onResetTimer={(kind) => void resetTimer(profile, kind).catch((error) => toast({ title: 'Could not reset timer', description: error instanceof Error ? error.message : 'Local storage failed.' }))} /></div>)}</div> : <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/.45)] px-6 text-center"><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><KeyRound size={24} /></div><h3 className="text-[16px] font-extrabold tracking-[-.03em]">{profiles.length === 0 ? 'Your control room is quiet' : selectedIde ? `No ${selectedIde} profiles match your filters` : 'No profiles match that search'}</h3><p className="mt-2 max-w-[320px] text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">{profiles.length === 0 ? 'Add your first account and model, then track its token and quota windows independently.' : 'Try a different name, email, account ID, IDE, model, or status filter.'}</p>{profiles.length === 0 && <button type="button" onClick={() => setModalProfile(null)} className="mt-5 rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-[11px] font-extrabold text-[hsl(var(--primary-foreground))]"><Plus size={14} className="mr-1 inline" /> Add first profile</button>}</div>}
          </section>
          <footer className="animate-rise animate-rise-3 mt-12 flex flex-col gap-3 border-t border-[hsl(var(--border)/.7)] pt-5 text-[10px] text-[hsl(var(--muted-foreground))] sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={() => setShowPreferences(true)} className="flex items-center gap-2 text-left hover:text-[hsl(var(--foreground))]"><ShieldCheck size={13} className="text-[hsl(var(--primary))]" /> Local-first · stored in this browser</button><div className="flex items-center gap-4"><span className="mono">v1.1.0</span><button type="button" onClick={() => setShowHelp(true)} className="flex items-center gap-1 hover:text-[hsl(var(--foreground))]"><CircleHelp size={13} /> How it works</button></div></footer>
        </div>
      </main>
      {modalProfile !== undefined && <ProfileModal profile={modalProfile} onClose={() => setModalProfile(undefined)} onSave={saveProfile} />}
      {profileToDelete && <DeleteModal profile={profileToDelete} onClose={() => setProfileToDelete(null)} onConfirm={deleteProfile} />}
      {showActivity && <ActivityModal entries={activity} onClose={() => setShowActivity(false)} onClear={async () => { await clearActivity(); await reloadData(); toast({ title: 'Activity cleared' }); }} />}
      {showPreferences && <PreferencesModal preferences={preferences} storageStatus={storageStatus} onClose={() => setShowPreferences(false)} onNotificationsChange={changeNotifications} onRequestStorage={refreshStorageStatus} onExport={downloadBackup} onImport={restoreBackup} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/ide/:ide" component={Home} /><Route component={NotFound} /></Switch>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><RoutedErrorBoundary><Router /></RoutedErrorBoundary></WouterRouter><Toaster /></TooltipProvider>;
}

export default App;
