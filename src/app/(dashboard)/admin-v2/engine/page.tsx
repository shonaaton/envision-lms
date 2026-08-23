import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2EngineClient from "@/components/admin-v2/AdminV2EngineClient";

export const dynamic = "force-dynamic";

export default function AdminV2EnginePage() {
  return <AdminV2Shell title="Chess Engine" description="Monitor shared Stockfish workers, priority queues, leases, and cache performance." activeHref="/admin-v2/engine"><AdminV2EngineClient /></AdminV2Shell>;
}
