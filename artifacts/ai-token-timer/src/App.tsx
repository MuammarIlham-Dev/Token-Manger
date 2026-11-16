import { type ChangeEvent, type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Bell, Check, ChevronDown, CircleHelp, Clock3,
  Code2, Database, Download, Gauge, History, KeyRound, Laptop2, Mail,
  Menu, Pencil, Plus, Search, Settings2, ShieldCheck,
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
  profileDisplayName, requestPersistentStorage, savePreferences, saveProfileWithActivity,
  subscribeToStore, updateProfileWithActivity,
  type ActivityAction, type ActivityEntry, type AppSnapshot, type BackupFile,
  type Preferences, type Profile, type StorageStatus, type TimerKind,
} from '@/lib/local-store';

type StatusFilter = 'all' | 'ready' | 'limited';

function formatDuration(totalMinutes: number) {
  const totalHours = Math.ceil(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (parts.length === 0) parts.push('0h');
  return parts.join(' ');
}

function splitDurationIntoDaysAndHours(totalMinutes: number) {
  const totalHours = Math.ceil(totalMinutes / 60);
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24 };
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
  if (kind === 'token' && !profile.tokenTimerEnabled) return false;
  const until = timerUntil(profile, kind);
  return until !== null && until > now;
}

function profileIsLimited(profile: Profile, now: number) {
  return isTimerRunning(profile, 'token', now) || isTimerRunning(profile, 'quota', now);
}

function AppLogo({ onDark = true }: { onDark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] shadow-[0_8px_20px_hsl(var(--sidebar-primary)/.2)]">
        <Gauge size={18} strokeWidth={2.4} />
        <span className="absolute bottom-[7px] h-1 w-1 rounded-full bg-[hsl(var(--accent))]" />
      </div>
      <div>
        <div className={`text-[13px] font-extrabold tracking-[-.03em] ${onDark ? 'text-[hsl(var(--sidebar-foreground))]' : 'text-[hsl(var(--foreground))]'}`}>Token Manager</div>
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
    <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="mono mb-2 px-2 text-[8px] font-medium uppercase tracking-[.2em] text-[hsl(var(--sidebar-foreground)/.42)]">Connections</div>
      <div className="space-y-2.5">
        {groupedProfiles.map(([ide, emails]) => (
          <div key={ide}>
            <button type="button" onClick={() => onSelectIde(ide)} aria-pressed={selectedIde === ide}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[10px] font-extrabold transition-colors ${selectedIde === ide ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))]' : 'text-[hsl(var(--sidebar-foreground)/.86)] hover:bg-[hsl(var(--sidebar-accent)/.65)]'}`}>
              <Laptop2 size={12} className="text-[hsl(var(--sidebar-primary))]" />
              <span className="truncate">{ide}</span>
              <span className="mono ml-auto text-[9px] text-[hsl(var(--sidebar-foreground)/.35)]">{Array.from(emails.values()).reduce((total, models) => total + models.size, 0)}</span>
            </button>
            <div className="ml-[16px] mt-1.5 space-y-1.5 border-l border-[hsl(var(--sidebar-border))] pl-2.5">
              {Array.from(emails.entries()).map(([email, models]) => (
                <div key={`${ide}-${email}`} className="min-w-0">
                  <div className="flex items-center gap-1 text-[9px] font-semibold text-[hsl(var(--sidebar-foreground)/.58)]"><Mail size={10} /><span className="truncate">{email}</span></div>
                  <div className="mt-1 space-y-0.5 pl-3.5">
                    {Array.from(models).sort().map((model) => (
                      <div key={`${email}-${model}`} className="flex items-center gap-1 text-[9px] text-[hsl(var(--sidebar-foreground)/.4)]"><Sparkles size={9} className="shrink-0 text-[hsl(var(--accent))]" /><span className="truncate">{model}</span></div>
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

function Sidebar({ profiles, selectedIde, onSelectIde, onActivity, onPreferences }: {
  profiles: Profile[]; selectedIde: string | null; onSelectIde: (ide: string) => void;
  onActivity: () => void; onPreferences: () => void;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[224px] shrink-0 flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] px-3.5 py-4 text-[hsl(var(--sidebar-foreground))] lg:flex">
      <AppLogo />
      <div className="mt-7">
        <div className="mono mb-2 px-2 text-[8px] font-medium uppercase tracking-[.2em] text-[hsl(var(--sidebar-foreground)/.42)]">Workspace</div>
        <nav className="space-y-0.5">
          <button type="button" onClick={() => onSelectIde(selectedIde ?? '')} className="flex w-full items-center gap-2.5 rounded-lg bg-[hsl(var(--sidebar-accent))] px-2.5 py-2 text-left text-[11px] font-semibold text-[hsl(var(--sidebar-foreground))]">
            <KeyRound size={14} strokeWidth={2.2} /><span className="flex-1">Profiles</span><span className="mono text-[9px] text-[hsl(var(--sidebar-foreground)/.42)]">{String(profiles.length).padStart(2, '0')}</span>
          </button>
          <button type="button" onClick={onActivity} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold text-[hsl(var(--sidebar-foreground)/.58)] transition-colors hover:bg-[hsl(var(--sidebar-accent)/.65)] hover:text-[hsl(var(--sidebar-foreground))]">
            <Activity size={14} strokeWidth={1.8} /><span className="flex-1">Activity log</span>
          </button>
        </nav>
      </div>
      <ConnectionTree profiles={profiles} selectedIde={selectedIde} onSelectIde={onSelectIde} />
      <div className="mt-auto">
        <div className="mb-2 rounded-xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent)/.5)] p-2.5">
          <div className="flex items-center gap-2 text-[10px] font-bold"><ShieldCheck size={13} className="text-[hsl(var(--sidebar-primary))]" /> Local browser vault</div>
          <div className="mt-1.5 pl-5 text-[9px] text-[hsl(var(--sidebar-foreground)/.55)]">IndexedDB · this device</div>
        </div>
        <button type="button" onClick={onPreferences} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[10px] font-semibold text-[hsl(var(--sidebar-foreground)/.64)] transition-colors hover:bg-[hsl(var(--sidebar-accent)/.65)]"><Settings2 size={14} /> Preferences & backups</button>
      </div>
    </aside>
  );
}

function Topbar({ onAdd, onMenu }: { onAdd: () => void; onMenu: () => void }) {
  return <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-[hsl(var(--border)/.75)] bg-[hsl(var(--background)/.94)] px-3 backdrop-blur-xl lg:hidden"><button type="button" onClick={onMenu} className="focus-ring rounded-lg p-1.5 text-[hsl(var(--muted-foreground))]" aria-label="Open menu"><Menu size={18} /></button><AppLogo onDark={false} /><button type="button" onClick={onAdd} className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-2.5 py-2 text-[10px] font-bold text-[hsl(var(--primary-foreground))] shadow-sm" aria-label="Add profile"><Plus size={14} /> Add</button></header>;
}

function DesktopTopbar({ onHelp, notificationsEnabled, onNotifications }: {
  onHelp: () => void;
  notificationsEnabled: boolean; onNotifications: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 hidden h-12 items-center justify-between border-b border-[hsl(var(--border)/.75)] bg-[hsl(var(--background)/.9)] px-4 backdrop-blur-xl lg:flex xl:px-6">
      <div className="flex items-center gap-2.5 text-[10px]">
        <span className="font-semibold text-[hsl(var(--muted-foreground))]">Workspace</span>
        <span className="text-[hsl(var(--border))]">/</span>
        <span className="font-extrabold text-[hsl(var(--foreground))]">Overview</span>
        <span className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--primary)/.16)] bg-[hsl(var(--primary)/.07)] px-2 py-0.5 text-[9px] font-bold text-[hsl(var(--primary))]"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" /> Local</span>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onNotifications} aria-pressed={notificationsEnabled} className={`focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold transition-colors ${notificationsEnabled ? 'border-[hsl(var(--primary)/.22)] bg-[hsl(var(--primary)/.07)] text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}><Bell size={13} /><span>Notifications</span><span className={`rounded px-1 py-0.5 text-[8px] uppercase ${notificationsEnabled ? 'bg-[hsl(var(--primary)/.12)]' : 'bg-[hsl(var(--muted))]'}`}>{notificationsEnabled ? 'On' : 'Off'}</span></button>
        <button type="button" onClick={onHelp} className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[10px] font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"><CircleHelp size={13} /> Help</button>
      </div>
    </header>
  );
}

function OverviewMetric({ label, value, detail, icon, tone = 'teal' }: {
  label: string; value: number; detail: string; icon: ReactNode; tone?: 'teal' | 'amber' | 'blue' | 'violet';
}) {
  const tones = {
    teal: 'bg-[hsl(var(--primary)/.09)] text-[hsl(var(--primary))]',
    amber: 'bg-[hsl(var(--accent)/.16)] text-[hsl(28_76%_38%)]',
    blue: 'bg-[hsl(211_86%_55%/.1)] text-[hsl(211_75%_42%)]',
    violet: 'bg-[hsl(264_70%_60%/.11)] text-[hsl(264_60%_48%)]',
  };
  return (
    <div className="metric-card group relative overflow-hidden rounded-xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2"><div className="min-w-0"><div className="truncate text-[9px] font-semibold text-[hsl(var(--muted-foreground))]">{label}</div><div className="mt-1 text-[22px] font-extrabold leading-none tracking-[-.055em] text-[hsl(var(--foreground))]">{value}</div></div><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</div></div>
      <div className="mt-2 truncate border-t border-[hsl(var(--border)/.65)] pt-1.5 text-[9px] font-medium text-[hsl(var(--muted-foreground))]">{detail}</div>
    </div>
  );
}

function StatusBadge({ limited }: { limited: boolean }) {
  return limited
    ? <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--accent)/.18)] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[.06em] text-[hsl(28 76% 34%)]"><span className="h-1 w-1 rounded-full bg-[hsl(var(--accent))]" /> Cooldown</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--primary)/.12)] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[.06em] text-[hsl(var(--primary))]"><span className="pulse-dot h-1 w-1 rounded-full bg-[hsl(var(--primary))]" /> Ready</span>;
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
    <div className={`timer-panel rounded-lg border p-2.5 ${running ? 'border-[hsl(var(--accent)/.28)] bg-[hsl(var(--accent)/.075)]' : 'border-[hsl(var(--border)/.8)] bg-[hsl(var(--background)/.72)]'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${running ? 'bg-[hsl(var(--accent)/.18)] text-[hsl(28_76%_36%)]' : 'bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]'}`}>
            {kind === 'token' ? <KeyRound size={12} /> : <Clock3 size={12} />}
          </div>
          <div className="min-w-0 truncate text-[10px] font-extrabold">{label}</div>
        </div>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-extrabold ${running ? 'bg-[hsl(var(--accent)/.2)] text-[hsl(28_76%_34%)]' : 'bg-[hsl(var(--primary)/.09)] text-[hsl(var(--primary))]'}`}>{running ? 'ACTIVE' : 'READY'}</span>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className={`mono text-[17px] font-semibold leading-none tracking-[-.055em] tabular-nums ${running ? 'text-[hsl(28_76%_30%)]' : 'text-[hsl(var(--foreground))]'}`} aria-label={running ? `${label} countdown` : `${label} duration`}>{running ? formatCountdown(remaining) : formatDuration(duration)}</div>
        <button type="button" onClick={running ? onReset : onStart} className={`focus-ring inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[9px] font-extrabold transition-all ${running ? 'text-[hsl(28_76%_34%)] hover:bg-[hsl(var(--accent)/.17)]' : 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm hover:shadow-md'}`}>
          {running ? <><TimerReset size={10} /> Reset</> : <><Plus size={10} /> Start</>}
        </button>
      </div>
      <div className={`mt-2 h-0.5 overflow-hidden rounded-full ${running ? 'bg-[hsl(var(--accent)/.18)]' : 'bg-[hsl(var(--border)/.68)]'}`}><div className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${running ? 'bg-[hsl(var(--accent))]' : 'w-0'}`} style={{ width: `${progress}%` }} /></div>
    </div>
  );
}

function ProfileCard({ profile, now, onEdit, onDelete, onStartTimer, onResetTimer }: {
  profile: Profile; now: number; onEdit: () => void; onDelete: () => void;
  onStartTimer: (kind: TimerKind) => void; onResetTimer: (kind: TimerKind) => void;
}) {
  const limited = profileIsLimited(profile, now);
  return (
    <article className={`card-shadow animate-rise group relative overflow-hidden rounded-2xl border bg-[hsl(var(--card))] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_48px_hsl(220_35%_20%/.11)] ${limited ? 'border-[hsl(var(--accent)/.4)]' : 'border-[hsl(var(--card-border))]'}`}>
      <div className="relative p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-[10px] font-extrabold ring-1 ring-inset ${limited ? 'bg-[hsl(var(--accent)/.16)] text-[hsl(28_76%_34%)] ring-[hsl(var(--accent)/.22)]' : 'bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))] ring-[hsl(var(--primary)/.12)]'}`}>{initials(profileDisplayName(profile))}</div>
            <div className="min-w-0"><h3 className="truncate text-[12px] font-extrabold tracking-[-.02em]">{profileDisplayName(profile)}</h3><div className="mt-0.5 flex min-w-0 items-center gap-1 text-[9px] text-[hsl(var(--muted-foreground))]"><Laptop2 size={10} className="shrink-0" /><span className="truncate">{profile.ide}</span><span className="text-[hsl(var(--border))]">·</span><span className="truncate">{profile.email}</span></div></div>
          </div>
          <div className="flex shrink-0 items-center gap-1"><StatusBadge limited={limited} /><button type="button" onClick={onEdit} className="focus-ring inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[9px] font-bold text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]" aria-label={`Edit ${profileDisplayName(profile)}`}><Pencil size={10} /> Edit</button></div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-[hsl(var(--border)/.75)] bg-[hsl(var(--background)/.7)] px-2 py-1 text-[9px] font-bold text-[hsl(var(--foreground))]"><Sparkles size={10} className="shrink-0 text-[hsl(var(--primary))]" /><span className="truncate">{profile.model}</span></span>
          {profile.accountId && <span className="max-w-full truncate rounded-md bg-[hsl(var(--muted)/.65)] px-2 py-1 text-[9px] font-semibold text-[hsl(var(--muted-foreground))]">ID · {profile.accountId}</span>}
        </div>
        <div className="mt-2 grid grid-cols-1 gap-1.5">
          {profile.tokenTimerEnabled && <TimerPanel kind="token" profile={profile} now={now} onStart={() => onStartTimer('token')} onReset={() => onResetTimer('token')} />}
          <TimerPanel kind="quota" profile={profile} now={now} onStart={() => onStartTimer('quota')} onReset={() => onResetTimer('quota')} />
        </div>
        <div className="mt-1 flex justify-end"><button type="button" onClick={onDelete} className="focus-ring inline-flex items-center gap-1 rounded px-1.5 py-1 text-[9px] font-bold text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--destructive)/.08)] hover:text-[hsl(var(--destructive))]" aria-label={`Delete ${profileDisplayName(profile)}`}><Trash2 size={10} /> Remove</button></div>
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
  tokenTimerEnabled: boolean;
  tokenDays: number;
  tokenHours: number;
  quotaDays: number;
  quotaHours: number;
};

const blankForm: FormState = {
  ide: '', name: '', accountId: '', email: '', model: '', tokenTimerEnabled: false,
  tokenDays: 0, tokenHours: 1, quotaDays: 0, quotaHours: 0,
};

function DurationFields({ label, days, hours, onDays, onHours, testId }: {
  label: string; days: number; hours: number; onDays: (value: number) => void;
  onHours: (value: number) => void; testId: string;
}) {
  return (
    <div>
      <span className="mono mb-1.5 block text-[8px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <label className="relative block"><span className="sr-only">{label} days</span><input type="number" min="0" max="365000" step="1" value={days} onChange={(event) => onDays(Number(event.target.value))} className="focus-ring h-8 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] px-2.5 pr-10 text-[10px] font-bold" data-testid={`${testId}-days`} /><span className="pointer-events-none absolute right-2.5 top-2.5 text-[8px] font-bold text-[hsl(var(--muted-foreground))]">days</span></label>
        <label className="relative block"><span className="sr-only">{label} hours</span><input type="number" min="0" max="23" step="1" value={hours} onChange={(event) => onHours(Number(event.target.value))} className="focus-ring h-8 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] px-2.5 pr-10 text-[10px] font-bold" data-testid={`${testId}-hours`} /><span className="pointer-events-none absolute right-2.5 top-2.5 text-[8px] font-bold text-[hsl(var(--muted-foreground))]">hours</span></label>
      </div>
    </div>
  );
}

function ProfileModal({ profile, onClose, onSave }: {
  profile: Profile | null; onClose: () => void; onSave: (form: FormState) => Promise<void>;
}) {
  const tokenDuration = profile ? splitDurationIntoDaysAndHours(profile.tokenRefreshDurationMinutes) : null;
  const quotaDuration = profile ? splitDurationIntoDaysAndHours(profile.quotaRefreshDurationMinutes) : null;
  const [form, setForm] = useState<FormState>(profile ? {
    ide: profile.ide, name: profile.name, accountId: profile.accountId,
    email: profile.email, model: profile.model, tokenTimerEnabled: profile.tokenTimerEnabled,
    tokenDays: tokenDuration!.days,
    tokenHours: tokenDuration!.hours,
    quotaDays: quotaDuration!.days,
    quotaHours: quotaDuration!.hours,
  } : blankForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const update = (key: keyof FormState, value: string | number | boolean) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.ide.trim() || !form.email.trim() || !form.model.trim()) {
      setError('Fill in the IDE, email, and model to continue.');
      return;
    }
    const durations = [form.quotaDays, form.quotaHours, ...(form.tokenTimerEnabled ? [form.tokenDays, form.tokenHours] : [])];
    if (durations.some((value) => !Number.isSafeInteger(value) || value < 0)
      || (form.tokenTimerEnabled && form.tokenDays > 365000) || form.quotaDays > 365000
      || (form.tokenTimerEnabled && form.tokenHours > 23) || form.quotaHours > 23
      || (form.tokenTimerEnabled && form.tokenDays === 0 && form.tokenHours === 0)
      || (form.quotaDays === 0 && form.quotaHours === 0)) {
      setError('The quota timer needs a duration of at least one hour. Hours must be between 0 and 23.');
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
      <div className="animate-rise max-h-[94dvh] w-full max-w-[620px] overflow-y-auto rounded-t-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-4 shadow-[0_24px_80px_hsl(205_34%_11%/.25)] sm:rounded-2xl sm:p-5">
        <div className="mb-4 flex items-start justify-between"><div><div className="mono mb-1 text-[8px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">{profile ? 'Update profile' : 'New access profile'}</div><h2 id="profile-modal-title" className="text-[20px] font-extrabold tracking-[-.05em]">{profile ? 'Tune this connection' : 'Add an account and its timers'}</h2><p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">Set account details and timer windows.</p></div><button type="button" onClick={onClose} className="focus-ring rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="Close"><X size={16} /></button></div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mono mb-1.5 block text-[8px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">IDE / app <span className="text-[hsl(var(--destructive))]">*</span></span><div className="relative"><Code2 className="pointer-events-none absolute left-2.5 top-2.5 text-[hsl(var(--muted-foreground))]" size={14} /><input required value={form.ide} onChange={(event) => update('ide', event.target.value)} placeholder="e.g. Cursor" className="focus-ring h-9 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] pl-9 pr-2.5 text-[10px] font-bold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))]" /></div></label>
            <label className="block"><span className="mono mb-1.5 block text-[8px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Profile name <span className="normal-case tracking-normal">(optional)</span></span><input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Defaults to email or model" className="focus-ring h-9 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] px-2.5 text-[10px] font-bold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))]" /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mono mb-1.5 block text-[8px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Email identity <span className="text-[hsl(var(--destructive))]">*</span></span><div className="relative"><Mail className="pointer-events-none absolute left-2.5 top-2.5 text-[hsl(var(--muted-foreground))]" size={14} /><input required type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="you@example.com" className="focus-ring h-9 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] pl-9 pr-2.5 text-[10px] font-bold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))]" /></div></label>
            <label className="block"><span className="mono mb-1.5 block text-[8px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Account ID <span className="normal-case tracking-normal">(optional)</span></span><input value={form.accountId} onChange={(event) => update('accountId', event.target.value)} placeholder="e.g. workspace or account ID" className="focus-ring h-9 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] px-2.5 text-[10px] font-bold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))]" /></label>
          </div>
          <label className="block"><span className="mono mb-1.5 block text-[8px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">LLM / model <span className="text-[hsl(var(--destructive))]">*</span></span><input required value={form.model} onChange={(event) => update('model', event.target.value)} placeholder="e.g. Claude, GPT-4.1, Gemini" className="focus-ring h-9 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background)/.55)] px-2.5 text-[10px] font-bold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))]" /></label>
          <div className="space-y-3 rounded-xl border border-[hsl(var(--border)/.7)] bg-[hsl(var(--background)/.4)] p-3">
            <div className="flex items-center justify-between gap-3"><div><div className="mono text-[8px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Token refresh timer</div><p className="mt-0.5 text-[9px] text-[hsl(var(--muted-foreground))]">Optional · use a separate token window</p></div><button type="button" role="switch" aria-label="Enable token refresh timer" aria-checked={form.tokenTimerEnabled} onClick={() => update('tokenTimerEnabled', !form.tokenTimerEnabled)} className={`focus-ring relative h-5 w-9 shrink-0 rounded-full transition-colors ${form.tokenTimerEnabled ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted-foreground)/.35)]'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.tokenTimerEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} /></button></div>
            {form.tokenTimerEnabled && <DurationFields label="Token refresh window" days={form.tokenDays} hours={form.tokenHours} onDays={(value) => update('tokenDays', value)} onHours={(value) => update('tokenHours', value)} testId="input-token-duration" />}
            <div className="border-t border-[hsl(var(--border)/.7)] pt-3"><DurationFields label="Quota reset window *" days={form.quotaDays} hours={form.quotaHours} onDays={(value) => update('quotaDays', value)} onHours={(value) => update('quotaHours', value)} testId="input-quota-duration" /></div>
          </div>
          <p className="-mt-1 text-[8px] text-[hsl(var(--muted-foreground))]">Quota timer is required. Start timers from each profile card.</p>
          {error && <div role="alert" className="rounded-lg bg-[hsl(var(--destructive)/.1)] px-2.5 py-2 text-[9px] font-bold text-[hsl(var(--destructive))]">{error}</div>}
          <div className="flex gap-2 pt-0.5"><button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[hsl(var(--border))] py-2 text-[10px] font-extrabold text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))]">Cancel</button><button type="submit" disabled={saving} className="focus-ring flex-[1.5] rounded-lg bg-[hsl(var(--primary))] py-2 text-[10px] font-extrabold text-[hsl(var(--primary-foreground))] shadow-sm transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"><Check size={13} className="mr-1 inline" />{saving ? 'Saving…' : profile ? 'Save changes' : 'Add profile'}</button></div>
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
  return <div className="fixed inset-0 z-30 flex items-center justify-center bg-[hsl(205_34%_11%/.48)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div className="animate-rise w-full max-w-[340px] rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5 shadow-[0_24px_80px_hsl(205_34%_11%/.25)]"><div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]"><Trash2 size={16} /></div><h2 id="delete-title" className="text-[17px] font-extrabold tracking-[-.04em]">Remove this profile?</h2><p className="mt-1.5 text-[10px] leading-relaxed text-[hsl(var(--muted-foreground))]"><strong className="text-[hsl(var(--foreground))]">{profileDisplayName(profile)}</strong> and its timers will be removed from this browser.</p><div className="mt-4 flex gap-2"><button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[hsl(var(--border))] py-2 text-[10px] font-extrabold text-[hsl(var(--muted-foreground))]">Keep it</button><button type="button" onClick={() => void confirm()} disabled={deleting} className="focus-ring flex-1 rounded-lg bg-[hsl(var(--destructive))] py-2 text-[10px] font-extrabold text-[hsl(var(--destructive-foreground))] disabled:opacity-60">{deleting ? 'Removing…' : 'Remove'}</button></div></div></div>;
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
      <div className="animate-rise max-h-[88dvh] w-full max-w-[540px] overflow-y-auto rounded-t-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-4 shadow-[0_24px_80px_hsl(205_34%_11%/.25)] sm:rounded-2xl sm:p-5">
        <div className="mb-4 flex items-start justify-between"><div><div className="mono mb-1 text-[8px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">Local history</div><h2 id="activity-title" className="text-[19px] font-extrabold tracking-[-.05em]">Activity log</h2><p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">Latest 500 profile and timer changes.</p></div><button type="button" onClick={onClose} className="focus-ring rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="Close activity log"><X size={16} /></button></div>
        {entries.length ? <div className="divide-y divide-[hsl(var(--border)/.7)] rounded-lg border border-[hsl(var(--border)/.7)]">{entries.map((entry) => <div key={entry.id} className="flex items-center gap-2 px-2.5 py-2"><div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--primary)/.09)] text-[hsl(var(--primary))]"><History size={12} /></div><div className="min-w-0 flex-1"><div className="text-[10px] font-bold">{describe(entry)}</div><div className="truncate text-[9px] text-[hsl(var(--muted-foreground))]">{entry.profileName}</div></div><time className="shrink-0 text-[8px] text-[hsl(var(--muted-foreground))]" dateTime={new Date(entry.occurredAt).toISOString()}>{new Date(entry.occurredAt).toLocaleString()}</time></div>)}</div> : <div className="rounded-lg border border-dashed border-[hsl(var(--border))] p-5 text-center text-[10px] text-[hsl(var(--muted-foreground))]">No activity yet. Profile and timer changes will appear here.</div>}
        <div className="mt-3 flex justify-end"><button type="button" onClick={() => void clear()} disabled={!entries.length || clearing} className="focus-ring rounded-md px-2.5 py-1.5 text-[9px] font-bold text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/.08)] disabled:cursor-not-allowed disabled:opacity-40">{clearing ? 'Clearing…' : 'Clear history'}</button></div>
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
      <div className="animate-rise max-h-[90dvh] w-full max-w-[520px] overflow-y-auto rounded-t-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-4 shadow-[0_24px_80px_hsl(205_34%_11%/.25)] sm:rounded-2xl sm:p-5">
        <div className="mb-4 flex items-start justify-between"><div><div className="mono mb-1 text-[8px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">On this device</div><h2 id="preferences-title" className="text-[19px] font-extrabold tracking-[-.05em]">Preferences & backups</h2><p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">Your profiles never leave this browser.</p></div><button type="button" onClick={onClose} className="focus-ring rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="Close preferences"><X size={16} /></button></div>
        <section className="rounded-xl border border-[hsl(var(--border)/.7)] p-3"><div className="flex items-start gap-2.5"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><Bell size={14} /></div><div className="min-w-0 flex-1"><h3 className="text-[10px] font-extrabold">Timer notifications</h3><p className="mt-0.5 text-[9px] leading-relaxed text-[hsl(var(--muted-foreground))]">Notify when a timer ends while the app is open. Browser permission is required.</p></div><input aria-label="Enable timer notifications" type="checkbox" checked={preferences.notificationsEnabled} disabled={!notificationSupported || busy} onChange={(event) => void run(() => onNotificationsChange(event.target.checked))} className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" /></div>{!notificationSupported && <p className="mt-2 text-[9px] font-semibold text-[hsl(var(--muted-foreground))]">Notifications are not available in this browser.</p>}</section>
        <section className="mt-2 rounded-xl border border-[hsl(var(--border)/.7)] p-3"><div className="flex items-start gap-2.5"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><Database size={14} /></div><div className="min-w-0 flex-1"><h3 className="text-[10px] font-extrabold">Browser storage</h3><p className="mt-0.5 text-[9px] leading-relaxed text-[hsl(var(--muted-foreground))]">{storageStatus?.persisted === true ? 'Persistent storage is enabled.' : storageStatus?.persisted === false ? 'The browser may clear this data under storage pressure.' : 'Storage persistence status is not available here.'}</p><p className="mt-1 text-[8px] text-[hsl(var(--muted-foreground))">Used {formatBytes(storageStatus?.usage ?? null)}{storageStatus?.quota ? ` of ${formatBytes(storageStatus.quota)}` : ''}</p></div><button type="button" disabled={busy || storageStatus?.persisted === true || storageStatus?.persisted === null} onClick={() => void run(onRequestStorage)} className="focus-ring rounded-md border border-[hsl(var(--border))] px-2.5 py-1.5 text-[9px] font-bold hover:bg-[hsl(var(--muted))] disabled:opacity-40">{storageStatus?.persisted ? 'Protected' : 'Request'}</button></div></section>
        <section className="mt-2 rounded-xl border border-[hsl(var(--border)/.7)] p-3"><div className="flex items-start gap-2.5"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><Download size={14} /></div><div className="min-w-0 flex-1"><h3 className="text-[10px] font-extrabold">Back up or restore</h3><p className="mt-0.5 text-[9px] leading-relaxed text-[hsl(var(--muted-foreground))]">Export JSON backups or import a file to merge profiles with this browser.</p></div></div><div className="mt-2.5 flex flex-wrap gap-1.5"><button type="button" disabled={busy} onClick={() => void run(onExport)} className="focus-ring inline-flex h-7 items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-2.5 text-[9px] font-extrabold text-[hsl(var(--primary-foreground))] disabled:opacity-50"><Download size={12} /> Export</button><label className={`focus-ring inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] px-2.5 text-[9px] font-extrabold hover:bg-[hsl(var(--muted))] ${busy ? 'pointer-events-none opacity-50' : ''}`}><Upload size={12} /> Import<input type="file" accept="application/json,.json" onChange={(event) => void chooseFile(event)} className="sr-only" disabled={busy} /></label></div></section>
        <p className="mt-2 text-[8px] leading-relaxed text-[hsl(var(--muted-foreground))]">Browser data can be cleared at any time. Backups are plain JSON and profile details are not encrypted.</p>
      </div>
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return <div className="fixed inset-0 z-40 flex items-end justify-center bg-[hsl(205_34%_11%/.48)] p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="help-title"><div className="animate-rise w-full max-w-[460px] rounded-t-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-4 shadow-[0_24px_80px_hsl(205_34%_11%/.25)] sm:rounded-2xl sm:p-5"><div className="mb-3 flex items-start justify-between"><div><div className="mono mb-1 text-[8px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">Help</div><h2 id="help-title" className="text-[19px] font-extrabold tracking-[-.05em]">Your timers, explained</h2></div><button type="button" onClick={onClose} className="focus-ring rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="Close help"><X size={16} /></button></div><div className="space-y-2 text-[10px] leading-relaxed text-[hsl(var(--muted-foreground))]"><p>Each profile has separate token refresh and quota reset durations. Start a timer when you hit its limit; reset it early if access returns.</p><p>Countdowns use saved end times and your device clock. They catch up after reload or sleep. Changing the system clock changes the remaining time.</p><p>Profiles and history stay in IndexedDB in this browser. They are not synced or encrypted. Export a backup before clearing site data or changing devices.</p><p>This is a manual tracker. It does not sign in to providers or read actual usage and quota information.</p></div><button type="button" onClick={onClose} className="focus-ring mt-4 w-full rounded-lg bg-[hsl(var(--primary))] py-2 text-[10px] font-extrabold text-[hsl(var(--primary-foreground))]">Got it</button></div></div>;
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
  const [sortBy, setSortBy] = useState<'name' | 'recent'>('name');
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
        if (kind === 'token' && !profile.tokenTimerEnabled) return;
        const until = timerUntil(profile, kind);
        if (!until || until > now) return;
        const key = `${profile.id}:${kind}:${until}`;
        if (handledExpirations.current.has(key)) return;
        handledExpirations.current.add(key);
        const entry: ActivityEntry = {
          id: `expired:${profile.id}:${kind}:${until}`, profileId: profile.id, profileName: profileDisplayName(profile),
          action: 'timer-expired', timerKind: kind, timerEndsAt: until, occurredAt: now,
        };
        void appendActivity(entry).catch((error) => toast({ title: 'Could not save timer activity', description: error instanceof Error ? error.message : 'Local storage failed.' }));
        if (preferences.notificationsEnabled && until >= pageStartedAt.current && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('Token Manager · Ready', { body: `${profileDisplayName(profile)}: ${kind === 'token' ? 'token refresh' : 'quota reset'} timer completed.` });
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
  }).sort((left, right) => sortBy === 'recent'
    ? right.createdAt - left.createdAt
    : profileDisplayName(left).localeCompare(profileDisplayName(right))), [profiles, query, selectedIde, filter, now, sortBy]);
  const workspaceProfiles = selectedIde ? profiles.filter((profile) => profile.ide === selectedIde) : profiles;
  const limitedCount = workspaceProfiles.filter((profile) => profileIsLimited(profile, now)).length;
  const readyCount = workspaceProfiles.length - limitedCount;
  const activeTimerCount = workspaceProfiles.reduce((count, profile) => count
    + Number(isTimerRunning(profile, 'token', now))
    + Number(isTimerRunning(profile, 'quota', now)), 0);

  async function saveProfile(form: FormState) {
    const existing = modalProfile && profiles.find((profile) => profile.id === modalProfile.id);
    const profile: Profile = {
      id: existing?.id ?? createId(),
      ide: form.ide, name: form.name.trim(), accountId: form.accountId,
      email: form.email, model: form.model,
      tokenTimerEnabled: form.tokenTimerEnabled,
      tokenRefreshDurationMinutes: form.tokenDays * 1440 + form.tokenHours * 60,
      quotaRefreshDurationMinutes: form.quotaDays * 1440 + form.quotaHours * 60,
      tokenRefreshUntil: form.tokenTimerEnabled ? existing?.tokenRefreshUntil ?? null : null,
      quotaRefreshUntil: existing?.quotaRefreshUntil ?? null,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    const action: ActivityAction = existing ? 'profile-updated' : 'profile-added';
    const entry: ActivityEntry = { id: createId(), profileId: profile.id, profileName: profileDisplayName(profile), action, occurredAt: Date.now() };
    if (existing) {
      await updateProfileWithActivity(profile.id, {
        ide: profile.ide, name: profile.name, accountId: profile.accountId,
        email: profile.email, model: profile.model, tokenTimerEnabled: profile.tokenTimerEnabled,
        tokenRefreshDurationMinutes: profile.tokenRefreshDurationMinutes,
        tokenRefreshUntil: profile.tokenRefreshUntil,
        quotaRefreshDurationMinutes: profile.quotaRefreshDurationMinutes,
      }, entry);
    } else {
      await saveProfileWithActivity(profile, entry);
    }
    await reloadData();
    setModalProfile(undefined);
    toast({ title: existing ? 'Profile updated' : 'Profile added', description: `${profileDisplayName(profile)} is saved in this browser.` });
  }

  async function startTimer(profile: Profile, kind: TimerKind) {
    if (kind === 'token' && !profile.tokenTimerEnabled) return;
    const until = Date.now() + timerDuration(profile, kind) * 60_000;
    const displayName = profileDisplayName(profile);
    const entry: ActivityEntry = { id: createId(), profileId: profile.id, profileName: displayName, action: 'timer-started', timerKind: kind, timerEndsAt: until, occurredAt: Date.now() };
    await updateProfileWithActivity(profile.id, { [kind === 'token' ? 'tokenRefreshUntil' : 'quotaRefreshUntil']: until }, entry);
    await reloadData();
    toast({ title: `${kind === 'token' ? 'Token' : 'Quota'} timer started`, description: `${displayName} · ${formatDuration(timerDuration(profile, kind))}` });
  }

  async function resetTimer(profile: Profile, kind: TimerKind) {
    const displayName = profileDisplayName(profile);
    const entry: ActivityEntry = { id: createId(), profileId: profile.id, profileName: displayName, action: 'timer-reset', timerKind: kind, occurredAt: Date.now() };
    await updateProfileWithActivity(profile.id, { [kind === 'token' ? 'tokenRefreshUntil' : 'quotaRefreshUntil']: null }, entry);
    await reloadData();
    toast({ title: `${kind === 'token' ? 'Token' : 'Quota'} timer reset`, description: `${displayName} is ready.` });
  }

  async function deleteProfile() {
    if (!profileToDelete) return;
    const profile = profileToDelete;
    await removeProfileWithActivity(profile, { id: createId(), profileId: profile.id, profileName: profileDisplayName(profile), action: 'profile-deleted', occurredAt: Date.now() });
    await reloadData();
    setProfileToDelete(null);
    toast({ title: 'Profile removed', description: `${profileDisplayName(profile)} was removed from this browser.` });
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
    <div className="app-shell flex min-h-screen text-[hsl(var(--foreground))]">
      <Sidebar profiles={profiles} selectedIde={selectedIde} onSelectIde={selectIde} onActivity={() => setShowActivity(true)} onPreferences={() => setShowPreferences(true)} />
      {mobileNav && (
        <div className="fixed inset-0 z-20 bg-[hsl(205_34%_11%/.35)] lg:hidden" onClick={() => setMobileNav(false)}>
          <div className="flex h-full w-[240px] flex-col bg-[hsl(var(--sidebar))] p-4" onClick={(event) => event.stopPropagation()}>
            <AppLogo />
            <div className="mt-7 mono text-[8px] uppercase tracking-[.2em] text-[hsl(var(--sidebar-foreground)/.42)]">Workspace</div>
            <button type="button" onClick={() => { setMobileNav(false); setFilter('all'); navigate('/'); }} className={`mt-2 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] font-bold text-[hsl(var(--sidebar-foreground))] ${selectedIde === null ? 'bg-[hsl(var(--sidebar-accent))]' : 'hover:bg-[hsl(var(--sidebar-accent)/.65)]'}`}>
              <KeyRound size={14} /> Profiles <span className="mono ml-auto text-[9px] opacity-50">{profiles.length}</span>
            </button>
            <button type="button" onClick={() => { setMobileNav(false); setShowActivity(true); }} className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] font-bold text-[hsl(var(--sidebar-foreground)/.75)] hover:bg-[hsl(var(--sidebar-accent)/.65)]"><Activity size={14} /> Activity log</button>
            <ConnectionTree profiles={profiles} selectedIde={selectedIde} onSelectIde={selectIde} />
            <button type="button" onClick={() => { setMobileNav(false); setShowPreferences(true); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[10px] font-semibold text-[hsl(var(--sidebar-foreground)/.65)]"><Settings2 size={14} /> Preferences & backups</button>
          </div>
        </div>
      )}
      <main className="min-w-0 flex-1">
        <Topbar onAdd={() => setModalProfile(null)} onMenu={() => setMobileNav(true)} />
        <DesktopTopbar onHelp={() => setShowHelp(true)} notificationsEnabled={preferences.notificationsEnabled} onNotifications={() => void changeNotifications(!preferences.notificationsEnabled).catch((error) => toast({ title: 'Could not update notifications', description: error instanceof Error ? error.message : 'Browser notification settings failed.' }))} />
        <div className="mx-auto max-w-[1600px] px-3 pb-6 pt-4 sm:px-4 sm:pt-5 lg:px-5 lg:pt-4">
          <section className="animate-rise flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.13em] text-[hsl(var(--primary))]"><Activity size={12} />{selectedIde ?? 'Workspace'}</div>
              <h1 className="text-[24px] font-extrabold leading-tight tracking-[-.055em] sm:text-[28px]">Access overview</h1>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {selectedIde && <button type="button" onClick={() => navigate('/')} className="focus-ring inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-[9px] font-bold text-[hsl(var(--muted-foreground))] shadow-sm transition-all hover:border-[hsl(var(--primary)/.3)] hover:text-[hsl(var(--primary))]">All workspaces</button>}
              <button type="button" onClick={() => setModalProfile(null)} className="focus-ring inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3.5 text-[9px] font-extrabold text-[hsl(var(--primary-foreground))] shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"><Plus size={13} strokeWidth={2.8} /> New profile</button>
            </div>
          </section>
          <section aria-label="Workspace metrics" className="animate-rise animate-rise-1 mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <OverviewMetric label="Profiles managed" value={workspaceProfiles.length} detail={selectedIde ? `In ${selectedIde}` : 'Across all workspaces'} icon={<KeyRound size={18} />} tone="blue" />
            <OverviewMetric label="Available now" value={readyCount} detail="Ready to use" icon={<Zap size={18} />} tone="teal" />
            <OverviewMetric label="Cooling down" value={limitedCount} detail="Waiting on a reset window" icon={<Clock3 size={18} />} tone="amber" />
            <OverviewMetric label="Active timers" value={activeTimerCount} detail="Live countdowns" icon={<TimerReset size={18} />} tone="violet" />
          </section>

          <section className="animate-rise animate-rise-2 mt-4">
            <div className="mb-2.5 flex flex-col justify-between gap-2 lg:flex-row lg:items-center">
              <div className="flex items-center gap-1.5"><h2 className="text-[15px] font-extrabold tracking-[-.035em]">Profiles</h2><span className="rounded-full bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[8px] font-bold text-[hsl(var(--muted-foreground))]">{workspaceProfiles.length}</span>{selectedIde && <span className="rounded-full bg-[hsl(var(--primary)/.09)] px-2 py-0.5 text-[8px] font-extrabold text-[hsl(var(--primary))]">{selectedIde}</span>}</div>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1 sm:min-w-[200px]"><Search className="pointer-events-none absolute left-2.5 top-2.5 text-[hsl(var(--muted-foreground))]" size={13} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search profiles, emails, models…" className="focus-ring h-8 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card))] pl-8 pr-2.5 text-[9px] font-semibold shadow-sm placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))]" /></div>
                <label className="relative"><span className="sr-only">Sort profiles</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'name' | 'recent')} className="focus-ring h-8 w-full appearance-none rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card))] px-2.5 pr-7 text-[9px] font-bold text-[hsl(var(--foreground))] shadow-sm sm:w-[126px]"><option value="name">Name A–Z</option><option value="recent">Recently added</option></select><ChevronDown className="pointer-events-none absolute right-2 top-2.5 text-[hsl(var(--muted-foreground))]" size={12} /></label>
                <div className="flex items-center gap-0.5 rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card))] p-0.5 shadow-sm" role="group" aria-label="Filter profiles by status">{(['all', 'ready', 'limited'] as const).map((option) => { const count = option === 'all' ? workspaceProfiles.length : option === 'ready' ? readyCount : limitedCount; return <button key={option} type="button" onClick={() => setFilter(option)} aria-pressed={filter === option} className={`focus-ring inline-flex h-7 items-center gap-1 rounded-md px-2 text-[9px] font-extrabold capitalize transition-colors ${filter === option ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/.7)] hover:text-[hsl(var(--foreground))]'}`}>{option === 'all' ? 'All' : option === 'limited' ? 'Cooldown' : 'Ready'}<span className={`text-[8px] ${filter === option ? 'text-white/70' : 'text-[hsl(var(--muted-foreground)/.75)]'}`}>{count}</span></button>; })}</div>
              </div>
            </div>
            <div className="mb-1.5 flex items-center justify-between text-[8px] text-[hsl(var(--muted-foreground))]"><span>{filteredProfiles.length} result{filteredProfiles.length === 1 ? '' : 's'}{query.trim() ? ` for “${query.trim()}”` : ''}</span>{(query || filter !== 'all' || selectedIde) && <button type="button" onClick={() => { setQuery(''); setFilter('all'); if (selectedIde) navigate('/'); }} className="focus-ring rounded px-1.5 py-0.5 font-bold text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/.08)]">Clear filters</button>}</div>
            {filteredProfiles.length > 0 ? <div className="profile-grid grid gap-2">{filteredProfiles.map((profile, index) => <div key={profile.id} style={{ animationDelay: `${index * 35}ms` }}><ProfileCard profile={profile} now={now} onEdit={() => setModalProfile(profile)} onDelete={() => setProfileToDelete(profile)} onStartTimer={(kind) => void startTimer(profile, kind).catch((error) => toast({ title: 'Could not start timer', description: error instanceof Error ? error.message : 'Local storage failed.' }))} onResetTimer={(kind) => void resetTimer(profile, kind).catch((error) => toast({ title: 'Could not reset timer', description: error instanceof Error ? error.message : 'Local storage failed.' }))} /></div>)}</div> : <div className="empty-state flex min-h-[170px] flex-col items-center justify-center rounded-xl border border-dashed border-[hsl(var(--border))] px-4 text-center"><div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><KeyRound size={17} /></div><h3 className="text-[12px] font-extrabold tracking-[-.03em]">{profiles.length === 0 ? 'A better overview starts here' : selectedIde ? `No ${selectedIde} profiles match your filters` : 'No profiles match that search'}</h3><p className="mt-1 max-w-[350px] text-[9px] leading-relaxed text-[hsl(var(--muted-foreground))]">{profiles.length === 0 ? 'Create your first profile to track an IDE, account, model, and quota window together.' : 'Try a different search or clear the active filters to see more profiles.'}</p>{profiles.length === 0 ? <button type="button" onClick={() => setModalProfile(null)} className="focus-ring mt-3 inline-flex h-7 items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 text-[9px] font-extrabold text-[hsl(var(--primary-foreground))] shadow-sm"><Plus size={12} /> Create profile</button> : <button type="button" onClick={() => { setQuery(''); setFilter('all'); if (selectedIde) navigate('/'); }} className="focus-ring mt-2 rounded px-2 py-1 text-[9px] font-bold text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/.08)]">Clear filters</button>}</div>}
          </section>
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
