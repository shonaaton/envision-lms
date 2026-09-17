"use client";

import { useState } from "react";

export function GoogleAnalyticsConnect({ propertyId: initialPropertyId = "" }: { propertyId?: string }) {
  const [propertyId, setPropertyId] = useState(initialPropertyId);
  const [error, setError] = useState("");
  function connect() {
    const value = propertyId.trim();
    if (!/^\d+$/.test(value)) return setError("Enter the numeric GA4 Property ID (for example, 431154835). ");
    window.location.assign(`/api/admin/google-analytics/connect?propertyId=${encodeURIComponent(value)}`);
  }
  return <div className="card max-w-3xl"><h2 className="text-lg font-black text-slate-950">Connect GA4 reports to this dashboard</h2><p className="mt-2 text-sm leading-6 text-slate-600">Sign in with the Google account that can view this GA4 property. The LMS requests only read-only Analytics access and keeps this connection separate from Internal Analytics and Google Business.</p><label className="mt-4 block text-sm font-bold text-slate-800" htmlFor="ga4-property-id">GA4 Property ID</label><div className="mt-1 flex flex-col gap-2 sm:flex-row"><input id="ga4-property-id" value={propertyId} onChange={(event) => setPropertyId(event.target.value)} inputMode="numeric" placeholder="431154835" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button type="button" onClick={connect} className="btn bg-brand text-white hover:bg-brand-700">Connect Google Analytics</button></div>{error ? <p className="mt-2 text-sm font-medium text-rose-700">{error}</p> : null}<p className="mt-3 text-xs leading-5 text-slate-500">You will return here after Google approves the connection.</p></div>;
}
