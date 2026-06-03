"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function NewClassroomPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      title: fd.get("title"),
      description: fd.get("description"),
      level: fd.get("level"),
      feePerMonth: Number(fd.get("feePerMonth") || 0) * 100, // INR -> paise
    };
    const res = await fetch("/api/classrooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!res.ok) return toast.error("Failed to create classroom");
    const c = await res.json();
    toast.success("Classroom created");
    router.push(`/classrooms/${c._id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 font-display text-3xl text-accent">New Classroom</h1>
      <form onSubmit={submit} className="card space-y-4">
        <input className="input" name="title" placeholder="Title (e.g. Sunday Beginners Batch)" required />
        <textarea className="input min-h-[100px]" name="description" placeholder="What students will learn" />
        <div className="grid grid-cols-2 gap-3">
          <select className="input" name="level" defaultValue="beginner">
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          <input className="input" name="feePerMonth" type="number" min="0" placeholder="Fee/month (₹)" />
        </div>
        <button className="btn-accent w-full" disabled={loading}>{loading ? "Creating..." : "Create classroom"}</button>
      </form>
    </div>
  );
}
