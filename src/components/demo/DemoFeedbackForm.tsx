"use client";

import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { CURRICULUM_TIER_OPTIONS, type CurriculumLevel } from "@/lib/demoCurriculum";
import { CLASS_TYPE_OPTIONS, DEMO_ASSESSMENT_SCALES } from "@/lib/demoAssessmentScales";

export type SalesPersonOption = { id: string; name: string };

export type DemoFeedbackDefaults = {
  salesPersonPresent: boolean;
  salesPerson: string;
  recommendedCourseLevel: string;
  recommendedStartingSession: number;
  coachRecommendation: string;
  hasFideRating: boolean;
  fideRating: string;
  calculationPower: string;
  tacticalStrength: string;
  endgameKnowledge: string;
  positionalSense: string;
  overallStrength: string;
  salesAdminNotes: string;
};

/**
 * The demo assessment a coach fills in the minute the class ends.
 *
 * Client-side because four of its answers change which fields matter: a demo
 * with no salesperson has nobody to name, an unrated player has no FIDE number
 * to give, and the starting topic only makes sense once a level is chosen -
 * showing all of it at once was the thing coaches complained about. The
 * questions themselves stay fixed; only their relevance moves.
 */
export default function DemoFeedbackForm({
  action,
  bookingId,
  studentName,
  coachName,
  salesPeople,
  curriculum,
  defaults,
}: {
  action: (formData: FormData) => void | Promise<void>;
  bookingId: string;
  studentName: string;
  coachName: string;
  salesPeople: SalesPersonOption[];
  curriculum: Record<string, CurriculumLevel[]>;
  defaults: DemoFeedbackDefaults;
}) {
  const [salesPresent, setSalesPresent] = useState(defaults.salesPersonPresent ? "yes" : "no");
  const [tier, setTier] = useState(defaults.recommendedCourseLevel);
  const [fideRated, setFideRated] = useState(defaults.hasFideRating ? "yes" : "no");

  const levels = useMemo(() => curriculum[tier] || [], [curriculum, tier]);
  // A session number from one tier means a different topic in the next, so the
  // saved pick only survives while the level it was made under is still chosen.
  const sessionDefault = tier === defaults.recommendedCourseLevel ? String(defaults.recommendedStartingSession || "") : "";

  return (
    <form action={action} className="grid gap-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <input type="hidden" name="bookingId" value={bookingId} />

      <Group title="Who was in the class">
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnly label="Student" value={studentName} />
          <ReadOnly label="Coach" value={coachName} />
          <Labelled label="Sales person present" hint="Was someone from sales in the call?">
            <select
              name="salesPersonPresent"
              value={salesPresent}
              onChange={(event) => setSalesPresent(event.target.value)}
              className="input h-11"
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Labelled>
          {salesPresent === "yes" ? (
            <Labelled label="Which sales person" hint={salesPeople.length ? undefined : "No sales accounts found - type the name in the notes below."}>
              <select name="salesPerson" defaultValue={defaults.salesPerson} required={salesPeople.length > 0} className="input h-11">
                <option value="">Select</option>
                {salesPeople.map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </select>
            </Labelled>
          ) : null}
        </div>
      </Group>

      <Group title="What to sell them">
        <div className="grid gap-4 sm:grid-cols-2">
          <Labelled label="Recommended course level">
            <select
              name="recommendedCourseLevel"
              value={tier}
              onChange={(event) => setTier(event.target.value)}
              required
              className="input h-11"
            >
              <option value="">Select level</option>
              {CURRICULUM_TIER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Labelled>
          <Labelled label="Start from" hint={tier ? undefined : "Pick a level first"}>
            <select
              name="recommendedStartingSession"
              key={tier || "no-tier"}
              defaultValue={sessionDefault}
              disabled={!levels.length}
              required={levels.length > 0}
              className="input h-11 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">Select starting session</option>
              {levels.map((level) => (
                <optgroup key={level.name} label={level.name}>
                  {level.sessions.map((session) => (
                    <option key={session.sessionNumber} value={session.sessionNumber}>
                      Session {session.sessionNumber} - {session.topic}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Labelled>
          <Labelled label="Type of class">
            <select name="coachRecommendation" defaultValue={defaults.coachRecommendation} required className="input h-11">
              <option value="">Select</option>
              {CLASS_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Labelled>
        </div>
      </Group>

      <Group title="Playing strength">
        <div className="grid gap-4 sm:grid-cols-2">
          <Labelled label="FIDE rated">
            <select
              name="hasFideRating"
              value={fideRated}
              onChange={(event) => setFideRated(event.target.value)}
              className="input h-11"
            >
              <option value="no">Not rated</option>
              <option value="yes">FIDE rated</option>
            </select>
          </Labelled>
          {fideRated === "yes" ? (
            <Labelled label="FIDE rating">
              <input
                name="fideRating"
                type="number"
                min={1000}
                max={3000}
                defaultValue={defaults.fideRating}
                required
                className="input h-11"
              />
            </Labelled>
          ) : null}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {DEMO_ASSESSMENT_SCALES.map((scale) => (
            <Scale key={scale.key} scale={scale} defaultValue={(defaults as any)[scale.key] || ""} />
          ))}
        </div>
      </Group>

      <Group title="Notes for the sales team">
        <textarea
          name="salesAdminNotes"
          defaultValue={defaults.salesAdminNotes}
          rows={5}
          placeholder="Anything sales should know before calling the parent - what the student enjoyed, what the parent asked about, scheduling constraints, anything specific to mention."
          className="input min-h-32 py-3"
        />
        <p className="mt-1.5 text-xs text-slate-500">Internal only. The parent never sees this.</p>
      </Group>

      <button className="btn-primary w-full sm:w-fit"><CheckCircle2 size={16} /> Submit Feedback</button>
    </form>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

function Labelled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-900">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-slate-900">{label}</span>
      <div className="flex h-11 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">{value}</div>
    </div>
  );
}

/**
 * A graded ladder. The hint under the box is the chosen rung's definition, so a
 * coach can check what "proficient" is supposed to mean without leaving the form.
 */
function Scale({ scale, defaultValue }: { scale: (typeof DEMO_ASSESSMENT_SCALES)[number]; defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const hint = scale.options.find((option) => option.value === value)?.hint;
  return (
    <Labelled label={scale.label} hint={hint}>
      <select name={scale.key} value={value} onChange={(event) => setValue(event.target.value)} required className="input h-11">
        <option value="">Select</option>
        {scale.options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </Labelled>
  );
}
