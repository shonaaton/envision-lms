"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BranchHeader, Stat, api } from "./shared";
import { WaitlistDrawer, WaitlistPanel, type WaitlistEntry } from "./Waitlist";
import type { Slot } from "./SlotsClient";

/** Everyone waiting for a seat, grouped by slot: added at the centre or from the website. */
export default function WaitlistClient({ can }: { can: string[] }) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [adding, setAdding] = useState(false);
  const canEdit = can.includes("students");

  const load = useCallback(async () => {
    try {
      const [slotData, waits] = await Promise.all([api<{ slots: Slot[] }>("/api/bowbazar/slots"), api<{ waitlist: WaitlistEntry[] }>("/api/bowbazar/waitlist")]);
      setSlots(slotData.slots);
      setWaitlist(waits.waitlist);
    } catch (error: any) {
      toast.error(error.message);
      setSlots([]);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const stats = useMemo(() => {
    const waitingSlots = new Set(waitlist.map((entry) => entry.slotId));
    const withSeat = (slots || []).filter((slot) => waitingSlots.has(slot.id) && slot.free > 0).length;
    return { total: waitlist.length, website: waitlist.filter((entry) => entry.source === "website").length, slots: waitingSlots.size, withSeat };
  }, [slots, waitlist]);

  return (
    <div className="space-y-4">
      <BranchHeader
        title="Waitlist"
        subtitle="Families waiting for a seat in a full batch. They can join from the centre page on the website too."
        can={can}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Waiting" value={stats.total} />
        <Stat label="From the website" value={stats.website} />
        <Stat label="Batches with a queue" value={stats.slots} />
        <Stat label="Seat free now" value={stats.withSeat} tone={stats.withSeat ? "good" : "default"} hint={stats.withSeat ? "Call the first family" : undefined} />
      </div>
      {!slots ? (
        <div className="flex items-center gap-2 p-5 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading the waitlist...
        </div>
      ) : (
        <WaitlistPanel slots={slots} waitlist={waitlist} canEdit={canEdit} onAdd={() => setAdding(true)} onChange={setWaitlist} />
      )}
      {adding && slots && (
        <WaitlistDrawer
          slots={slots}
          onClose={() => setAdding(false)}
          onSaved={(list) => {
            setAdding(false);
            setWaitlist(list);
          }}
        />
      )}
    </div>
  );
}
