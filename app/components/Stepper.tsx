interface StepperProps {
  current: number; // 1-based
}

const STEPS = ["Upload", "Preview", "Import", "Result"];

/** Horizontal step indicator for the 4-step import flow. */
export default function Stepper({ current }: StepperProps) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold transition ${
                  active
                    ? "bg-brand-500 text-white"
                    : done
                      ? "bg-brand-100 text-brand-600 dark:bg-brand-500/20"
                      : "bg-[var(--surface-2)] text-[var(--text-muted)]"
                }`}
              >
                {done ? "✓" : step}
              </span>
              <span
                className={`hidden text-sm font-medium sm:inline ${
                  active ? "text-[var(--text)]" : "text-[var(--text-muted)]"
                }`}
              >
                {label}
              </span>
            </div>
            {step < STEPS.length && (
              <span className={`h-px w-5 sm:w-8 ${done ? "bg-brand-400" : "bg-[var(--border)]"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
