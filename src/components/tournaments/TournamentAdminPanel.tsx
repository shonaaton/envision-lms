"use client";

import { useState } from "react";
import {
  BarChart3,
  Ban,
  ChevronDown,
  Copy,
  Download,
  Flag,
  Link2,
  Megaphone,
  Pencil,
  Play,
  Shield,
  SkipForward,
  UserMinus,
} from "lucide-react";
import { GameDialog } from "./game/GameDialog";

/**
 * Everything an arbiter can do, in one place.
 *
 * These controls used to be scattered through the player's page, fourteen
 * separate `canManage` branches interleaved with standings and pairings. A
 * student saw a wall of things they could not use, and an admin had to hunt for
 * the one they wanted. Now the whole surface is collapsed behind a single
 * heading that only appears for people who can act on it.
 *
 * Anything irreversible asks first, and anything that changes a recorded result
 * asks for a reason that is written to the audit trail.
 */

type Confirmable = {
  title: string;
  description: string;
  confirmLabel: string;
  tone: "danger" | "default";
  run: () => void | Promise<void>;
};

export function TournamentAdminPanel({
  tournamentId,
  tournament,
  games,
  standings,
  pending,
  onAction,
  onPatch,
  onRefresh,
  onError,
}: {
  tournamentId: string;
  tournament: any;
  games: any[];
  standings: any[];
  pending: boolean;
  onAction: (path: string, body?: any) => Promise<void>;
  onPatch: (body: any) => Promise<boolean>;
  onRefresh: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirmable | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<any>({});
  const [inviteDraft, setInviteDraft] = useState<any>({});
  const [announceDraft, setAnnounceDraft] = useState({ title: "Tournament announcement", message: "" });
  const [correction, setCorrection] = useState<{ gameId: string; label: string; current: string; result: string; reason: string } | null>(null);
  const [removing, setRemoving] = useState<{ playerKey: string; name: string } | null>(null);

  const status = String(tournament?.status || "");
  const isPlaying = ["live", "playing"].includes(status);
  const isOver = ["completed", "finished", "cancelled"].includes(status);
  const isSwiss = tournament?.type === "swiss";
  const completedGames = games.filter((game: any) => game.status === "completed");

  const ask = (next: Confirmable) => setConfirm(next);

  async function correctResult() {
    if (!correction) return;
    const response = await fetch(`/api/tournaments/games/${correction.gameId}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        result: correction.result,
        reason: correction.reason.trim() || `Corrected from ${correction.current} to ${correction.result}.`,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      onError(payload?.error || "Could not correct the result.");
      return;
    }
    setCorrection(null);
    await onRefresh();
  }

  async function removeParticipant() {
    if (!removing) return;
    const response = await fetch(`/api/tournaments/${tournamentId}/participants`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerKey: removing.playerKey }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      onError(payload?.error || "Could not remove that participant.");
      return;
    }
    setRemoving(null);
    await onRefresh();
  }

  async function announce() {
    const response = await fetch(`/api/tournaments/${tournamentId}/announce`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(announceDraft),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      onError(payload?.error || "Could not send the announcement.");
      return;
    }
    setAnnounceOpen(false);
    setAnnounceDraft({ title: "Tournament announcement", message: "" });
    await onRefresh();
  }

  async function clone() {
    const response = await fetch(`/api/tournaments/${tournamentId}/clone`, { method: "POST" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      onError(payload?.error || "Could not clone the tournament.");
      return;
    }
    const payload = await response.json();
    if (payload?.tournamentId) window.location.href = `/tournaments/${payload.tournamentId}`;
  }

  return (
    <section className="rounded-lg border border-brand/20 bg-white/95 shadow-sm shadow-brand-900/5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="tournament-admin-body"
        className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left"
      >
        <Shield size={16} className="text-brand" aria-hidden />
        <span className="flex-1 text-sm font-semibold text-slate-900">Arbiter controls</span>
        {tournament?.pausedByAdmin ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">Pairing paused</span>
        ) : null}
        <ChevronDown size={16} aria-hidden className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div id="tournament-admin-body" className="space-y-4 border-t border-slate-200/80 px-4 py-4">
          <p className="text-xs text-slate-500">
            The tournament runs itself: it starts, pairs, flags clocks and finishes on schedule. These are the overrides for when an
            arbiter needs to step in.
          </p>

          {/* Running the event. */}
          <Group title="Run the event">
            {!isPlaying && !isOver ? (
              <AdminButton
                icon={<Play size={14} />}
                label="Start now"
                onClick={() =>
                  ask({
                    title: "Start this tournament now?",
                    description: "Players are paired immediately and the clock begins, ahead of the scheduled start time.",
                    confirmLabel: "Start now",
                    tone: "default",
                    run: () => onAction(`/api/tournaments/${tournamentId}/start`),
                  })
                }
                disabled={pending}
              />
            ) : null}
            {isPlaying ? (
              <AdminButton
                icon={<Shield size={14} />}
                label={tournament?.pausedByAdmin ? "Resume pairing" : "Pause pairing"}
                tone={tournament?.pausedByAdmin ? "default" : "warning"}
                onClick={() =>
                  ask({
                    title: tournament?.pausedByAdmin ? "Resume pairing?" : "Pause pairing?",
                    description: tournament?.pausedByAdmin
                      ? "New pairings resume immediately."
                      : "No new boards are created. Games already in progress carry on to their finish.",
                    confirmLabel: tournament?.pausedByAdmin ? "Resume" : "Pause",
                    tone: "default",
                    run: () => onAction(`/api/tournaments/${tournamentId}/${tournament?.pausedByAdmin ? "resume" : "admin-pause"}`),
                  })
                }
                disabled={pending}
              />
            ) : null}
            {isPlaying && isSwiss ? (
              <AdminButton
                icon={<SkipForward size={14} />}
                label="Force next round"
                tone="warning"
                onClick={() =>
                  ask({
                    title: "Force the next round?",
                    description:
                      "Rounds advance on their own once every board finishes. Forcing now aborts any game still being played, and those games score nothing.",
                    confirmLabel: "Force next round",
                    tone: "danger",
                    run: () => onAction(`/api/tournaments/${tournamentId}/next-round`, { force: true }),
                  })
                }
                disabled={pending}
              />
            ) : null}
            {isPlaying ? (
              <AdminButton
                icon={<Flag size={14} />}
                label="End tournament"
                tone="danger"
                onClick={() =>
                  ask({
                    title: "End this tournament now?",
                    description:
                      "Games still in progress are aborted rather than decided, so nobody is handed a result they did not play for. Standings are frozen as they stand.",
                    confirmLabel: "End tournament",
                    tone: "danger",
                    run: () => onAction(`/api/tournaments/${tournamentId}/end`),
                  })
                }
                disabled={pending}
              />
            ) : null}
            {!isOver ? (
              <AdminButton
                icon={<Ban size={14} />}
                label="Cancel tournament"
                tone="danger"
                onClick={() =>
                  ask({
                    title: "Cancel this tournament?",
                    description: "Every game in progress is aborted and no results are recorded. This cannot be undone.",
                    confirmLabel: "Cancel tournament",
                    tone: "danger",
                    run: () => onAction(`/api/tournaments/${tournamentId}/cancel`),
                  })
                }
                disabled={pending}
              />
            ) : null}
          </Group>

          {/* Setting it up. */}
          <Group title="Setup">
            <AdminButton
              icon={<Pencil size={14} />}
              label="Edit details"
              onClick={() => {
                setEditDraft({
                  name: tournament?.name || "",
                  description: tournament?.description || "",
                  entryRestrictions: tournament?.entryRestrictions || "",
                  lateJoiningAllowed: tournament?.lateJoiningAllowed !== false,
                  chatEnabled: Boolean(tournament?.chatEnabled),
                });
                setEditOpen(true);
              }}
            />
            <AdminButton
              icon={<Link2 size={14} />}
              label="External access"
              onClick={() => {
                setInviteDraft({
                  enabled: Boolean(tournament?.externalInvite?.enabled),
                  accessMode: tournament?.externalInvite?.accessMode || "private",
                  password: tournament?.externalInvite?.password || "",
                  entryCode: tournament?.externalInvite?.entryCode || "",
                });
                setInviteOpen(true);
              }}
            />
            <AdminButton icon={<Megaphone size={14} />} label="Announce" onClick={() => setAnnounceOpen(true)} />
            <AdminButton icon={<Copy size={14} />} label="Clone" onClick={clone} />
          </Group>

          {/* Getting data out. */}
          <Group title="Reports">
            {games.length ? (
              <AdminButton
                icon={<Download size={14} />}
                label="Export games"
                onClick={() => {
                  window.location.href = `/api/tournaments/${tournamentId}/games/export`;
                }}
              />
            ) : null}
            {standings.length ? (
              <AdminButton
                icon={<BarChart3 size={14} />}
                label="Participation"
                onClick={() => {
                  window.location.href = `/api/tournaments/${tournamentId}/participation-report`;
                }}
              />
            ) : null}
            {games.length ? (
              <AdminButton
                icon={<Shield size={14} />}
                label="Fair play"
                onClick={() => {
                  window.location.href = `/api/tournaments/${tournamentId}/fair-play-report`;
                }}
              />
            ) : null}
          </Group>

          {/* Players. */}
          {standings.length ? (
            <details className="rounded-lg border border-slate-200/80">
              <summary className="min-h-11 cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-slate-700">
                Players ({standings.length})
              </summary>
              <ol className="max-h-64 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100">
                {standings.map((entry: any) => (
                  <li key={entry.playerKey} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-slate-700">{entry.displayName}</span>
                    <span className="shrink-0 tabular-nums text-slate-500">{entry.points} pts</span>
                    <button
                      type="button"
                      onClick={() => setRemoving({ playerKey: entry.playerKey, name: entry.displayName })}
                      className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      <UserMinus size={13} aria-hidden /> Remove
                    </button>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}

          {/* Result correction. */}
          {completedGames.length ? (
            <details className="rounded-lg border border-slate-200/80">
              <summary className="min-h-11 cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-slate-700">
                Correct a result ({completedGames.length} finished)
              </summary>
              <ol className="max-h-64 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100">
                {completedGames.slice(0, 40).map((game: any) => (
                  <li key={String(game._id)} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      {game.whiteName} <span className="text-slate-400">vs</span> {game.blackName || "Bye"}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-600">{game.result}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setCorrection({
                          gameId: String(game._id),
                          label: `${game.whiteName} vs ${game.blackName || "Bye"}`,
                          current: game.result,
                          result: game.result,
                          reason: "",
                        })
                      }
                      className="inline-flex h-9 shrink-0 items-center rounded-lg px-2 text-xs font-semibold text-brand hover:bg-brand-50"
                    >
                      Change
                    </button>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}

          {/* Audit trail. */}
          {(tournament?.adminActions || []).length ? (
            <details className="rounded-lg border border-slate-200/80">
              <summary className="min-h-11 cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-slate-700">Audit trail</summary>
              <ol className="max-h-64 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100 text-xs">
                {[...(tournament.adminActions || [])].reverse().slice(0, 40).map((entry: any, index: number) => (
                  <li key={`${entry.action}-${index}`} className="px-3 py-2">
                    <div className="font-semibold text-slate-700">{entry.action}</div>
                    {entry.note ? <div className="text-slate-500">{entry.note}</div> : null}
                    <div className="text-slate-400">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ""}</div>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </div>
      ) : null}

      <GameDialog
        open={confirm !== null}
        title={confirm?.title || ""}
        description={confirm?.description}
        tone={confirm?.tone === "danger" ? "danger" : "default"}
        onClose={() => setConfirm(null)}
      >
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setConfirm(null)} className="btn-ghost min-h-11">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const action = confirm;
              setConfirm(null);
              void action?.run();
            }}
            className={confirm?.tone === "danger" ? "btn min-h-11 bg-red-600 text-white hover:bg-red-700" : "btn-primary min-h-11"}
          >
            {confirm?.confirmLabel}
          </button>
        </div>
      </GameDialog>

      <GameDialog open={editOpen} title="Edit tournament" onClose={() => setEditOpen(false)}>
        <div className="mt-3 space-y-3">
          <Field label="Name">
            <input className="input" value={editDraft.name || ""} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} />
          </Field>
          <Field label="Description">
            <textarea
              className="input min-h-20"
              value={editDraft.description || ""}
              onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })}
            />
          </Field>
          <Field label="Entry notes">
            <input
              className="input"
              value={editDraft.entryRestrictions || ""}
              onChange={(event) => setEditDraft({ ...editDraft, entryRestrictions: event.target.value })}
            />
          </Field>
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={editDraft.lateJoiningAllowed !== false}
              onChange={(event) => setEditDraft({ ...editDraft, lateJoiningAllowed: event.target.checked })}
            />
            Allow players to join after the start
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(editDraft.chatEnabled)}
              onChange={(event) => setEditDraft({ ...editDraft, chatEnabled: event.target.checked })}
            />
            Enable tournament chat
          </label>
        </div>
        <DialogActions
          onCancel={() => setEditOpen(false)}
          onSave={async () => {
            if (await onPatch(editDraft)) setEditOpen(false);
          }}
        />
      </GameDialog>

      <GameDialog open={inviteOpen} title="External access" description="Let players outside the academy enter with a link." onClose={() => setInviteOpen(false)}>
        <div className="mt-3 space-y-3">
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(inviteDraft.enabled)}
              onChange={(event) => setInviteDraft({ ...inviteDraft, enabled: event.target.checked })}
            />
            Enable the external invitation link
          </label>
          <Field label="Who can enter">
            <select
              className="input"
              value={inviteDraft.accessMode || "private"}
              onChange={(event) => setInviteDraft({ ...inviteDraft, accessMode: event.target.value })}
            >
              <option value="private">Invited only</option>
              <option value="password">Anyone with the password</option>
              <option value="entry_code">Anyone with an entry code</option>
              <option value="public">Anyone with the link</option>
            </select>
          </Field>
          {inviteDraft.accessMode === "password" ? (
            <Field label="Password">
              <input className="input" value={inviteDraft.password || ""} onChange={(event) => setInviteDraft({ ...inviteDraft, password: event.target.value })} />
            </Field>
          ) : null}
          {inviteDraft.accessMode === "entry_code" ? (
            <Field label="Entry code">
              <input className="input" value={inviteDraft.entryCode || ""} onChange={(event) => setInviteDraft({ ...inviteDraft, entryCode: event.target.value })} />
            </Field>
          ) : null}
        </div>
        <DialogActions
          onCancel={() => setInviteOpen(false)}
          onSave={async () => {
            if (await onPatch({ externalInvite: inviteDraft })) setInviteOpen(false);
          }}
        />
      </GameDialog>

      <GameDialog open={announceOpen} title="Announce" description="Sent to everyone entered in this tournament." onClose={() => setAnnounceOpen(false)}>
        <div className="mt-3 space-y-3">
          <Field label="Title">
            <input className="input" value={announceDraft.title} onChange={(event) => setAnnounceDraft({ ...announceDraft, title: event.target.value })} />
          </Field>
          <Field label="Message">
            <textarea
              className="input min-h-24"
              value={announceDraft.message}
              onChange={(event) => setAnnounceDraft({ ...announceDraft, message: event.target.value })}
            />
          </Field>
        </div>
        <DialogActions onCancel={() => setAnnounceOpen(false)} onSave={announce} saveLabel="Send" disabled={!announceDraft.message.trim()} />
      </GameDialog>

      <GameDialog
        open={correction !== null}
        title="Correct a result"
        description={`${correction?.label || ""} - currently recorded as ${correction?.current || ""}.`}
        tone="danger"
        onClose={() => setCorrection(null)}
      >
        <div className="mt-3 space-y-3">
          <Field label="New result">
            <select
              className="input"
              value={correction?.result || ""}
              onChange={(event) => setCorrection(correction ? { ...correction, result: event.target.value } : null)}
            >
              <option value="1-0">White wins (1-0)</option>
              <option value="0-1">Black wins (0-1)</option>
              <option value="1/2-1/2">Draw (1/2-1/2)</option>
            </select>
          </Field>
          <Field label="Reason (recorded in the audit trail)">
            <input
              className="input"
              value={correction?.reason || ""}
              onChange={(event) => setCorrection(correction ? { ...correction, reason: event.target.value } : null)}
              placeholder="Why is this being changed?"
            />
          </Field>
          <p className="text-xs text-slate-500">Standings are recomputed from every game, so correcting the same result twice cannot double-count it.</p>
        </div>
        <DialogActions onCancel={() => setCorrection(null)} onSave={correctResult} saveLabel="Correct result" danger />
      </GameDialog>

      <GameDialog
        open={removing !== null}
        title="Remove this player?"
        description={`${removing?.name || "This player"} is removed from the tournament and any game they are playing is aborted.`}
        tone="danger"
        onClose={() => setRemoving(null)}
      >
        <DialogActions onCancel={() => setRemoving(null)} onSave={removeParticipant} saveLabel="Remove player" danger />
      </GameDialog>
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  if (Array.isArray(items) && !items.length) return null;
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{title}</h3>
      <div className="flex flex-wrap gap-2">{items}</div>
    </div>
  );
}

function AdminButton({
  icon,
  label,
  onClick,
  tone = "default",
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "warning" | "danger";
  disabled?: boolean;
}) {
  const styles =
    tone === "danger"
      ? "border-red-200 bg-white text-red-700 hover:bg-red-50"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
        : "border-slate-200 bg-white text-slate-700 hover:border-brand/40 hover:text-brand";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`btn min-h-11 border ${styles} disabled:opacity-50`}>
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function DialogActions({
  onCancel,
  onSave,
  saveLabel = "Save",
  danger,
  disabled,
}: {
  onCancel: () => void;
  onSave: () => void | Promise<void>;
  saveLabel?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4 flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="btn-ghost min-h-11">
        Cancel
      </button>
      <button
        type="button"
        onClick={() => void onSave()}
        disabled={disabled}
        className={danger ? "btn min-h-11 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50" : "btn-primary min-h-11 disabled:opacity-50"}
      >
        {saveLabel}
      </button>
    </div>
  );
}
