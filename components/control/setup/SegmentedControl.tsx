interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
  /** Grid columns for the compact (no-description) pill layout. Ignored when options carry descriptions. */
  columns?: 2 | 3 | 4;
}

const COMPACT_GRID_CLASS: Record<2 | 3 | 4, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

/**
 * Shared touch selector for setup-screen choices (difficulty, target size,
 * spacing, play area) — one visual pattern reused everywhere so the
 * therapist only has to learn it once. The selected state is deliberately
 * loud (filled fill + ring + a checkmark, not just a color tint) per the
 * spec's "must be extremely obvious" requirement. Options with a
 * description (difficulty) render as taller cards; options without one
 * (size/spacing/play area) render as compact pills — same component,
 * density follows the data.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  columns = 3,
  ...props
}: SegmentedControlProps<T>) {
  const hasDescriptions = options.some((o) => o.description);

  return (
    <div
      role="radiogroup"
      aria-label={props["aria-label"]}
      className={hasDescriptions ? "grid grid-cols-1 gap-3 sm:grid-cols-3" : `grid gap-2.5 ${COMPACT_GRID_CLASS[columns]}`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`relative flex min-h-11 touch-manipulation flex-col items-center justify-center gap-1 rounded-2xl border-2 px-3 text-center transition-all duration-150 select-none active:scale-[0.97] ${
              hasDescriptions ? "py-4" : "py-3"
            } ${
              selected
                ? "border-teal-600 bg-teal-600 text-white shadow-md shadow-teal-900/15"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 active:bg-slate-50"
            }`}
          >
            <span className={`font-semibold ${hasDescriptions ? "text-base" : "text-sm"}`}>{option.label}</span>
            {option.description && (
              <span className={`text-xs leading-snug ${selected ? "text-teal-50" : "text-slate-500"}`}>
                {option.description}
              </span>
            )}
            {selected && (
              <span className="absolute top-2 left-2 flex h-4 w-4 items-center justify-center rounded-full bg-white/25">
                <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 fill-white">
                  <path d="M6.5 11.5 3 8l1-1 2.5 2.5L12 4l1 1z" />
                </svg>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
