type Variant = "page" | "table" | "detail";

/**
 * Placeholder layout shown while a route's code or its first data request is loading, so navigation
 * switches pages immediately and the content fills in afterwards.
 */
export function PageSkeleton({ variant = "page", label = "Loading page" }: { variant?: Variant; label?: string }) {
  return <div className={`page-skeleton page-skeleton--${variant}`} role="status" aria-live="polite" aria-label={label}>
    <span className="sr-only">{label}…</span>
    <div className="page-skeleton-head" aria-hidden="true"><i className="is-eyebrow" /><i className="is-title" /><i className="is-line" /></div>
    {variant === "page" && <div className="page-skeleton-cards" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div key={index}><i className="is-line" /><i className="is-number" /></div>)}</div>}
    {variant === "detail" ? <div className="page-skeleton-detail" aria-hidden="true">
      <div className="page-skeleton-panel">{Array.from({ length: 6 }, (_, index) => <i key={index} className="is-line" />)}</div>
      <div className="page-skeleton-panel is-side">{Array.from({ length: 4 }, (_, index) => <i key={index} className="is-line" />)}</div>
    </div> : <div className="page-skeleton-panel" aria-hidden="true">
      <i className="is-toolbar" />
      {Array.from({ length: variant === "table" ? 7 : 5 }, (_, index) => <div key={index} className="page-skeleton-row"><i /><i /><i /><i /></div>)}
    </div>}
  </div>;
}
