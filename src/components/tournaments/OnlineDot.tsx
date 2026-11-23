/**
 * Green when the player is in the tournament room (event page or play room
 * open, or seen in the last 30 seconds), grey when not.
 */
export function OnlineDot({ online, className = "" }: { online: boolean; className?: string }) {
  const label = online ? "Online" : "Offline";
  return (
    <span
      title={label}
      className={[
        "inline-block h-2 w-2 shrink-0 rounded-full",
        online ? "bg-emerald-500" : "bg-slate-300",
        className,
      ].join(" ")}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}
