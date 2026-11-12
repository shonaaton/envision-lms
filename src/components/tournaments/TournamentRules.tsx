import type { RuleSection } from "@/lib/tournament/rules";

/**
 * The tournament rules, grouped. Presentational only, so the invite page, the
 * portal registration dialog and the event page all render the same list from
 * lib/tournament/rules.ts.
 */
export function TournamentRules({ sections, compact = false }: { sections: RuleSection[]; compact?: boolean }) {
  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {sections.map((section) => (
        <section key={section.title}>
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{section.title}</h3>
          <ul className="mt-1.5 list-disc space-y-1.5 pl-5 text-sm leading-6 text-slate-700 marker:text-slate-300">
            {section.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
