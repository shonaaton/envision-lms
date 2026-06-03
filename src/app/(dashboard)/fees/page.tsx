import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import PayButton from "@/components/PayButton";

export default async function FeesPage() {
  const session = await auth();
  const userId = (session?.user as any).id;
  await dbConnect();
  const classrooms = await Classroom.find({ students: userId, feePerMonth: { $gt: 0 } }).lean();
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-accent">Fee Collection</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {classrooms.map((c: any) => (
          <div key={c._id} className="card flex items-center justify-between">
            <div>
              <div className="text-white font-semibold">{c.title}</div>
              <div className="text-xs text-gray-400">Monthly fee</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-accent text-xl font-bold">₹{(c.feePerMonth / 100).toFixed(0)}</div>
              <PayButton amount={c.feePerMonth} purpose="enrollment" refId={c._id.toString()} label="Pay fee" />
            </div>
          </div>
        ))}
        {classrooms.length === 0 && <div className="card text-sm text-gray-400">No fees due.</div>}
      </div>
    </div>
  );
}
