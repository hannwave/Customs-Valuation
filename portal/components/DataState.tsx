"use client";

import { FiAlertCircle, FiSearch } from "react-icons/fi";

type DataStateProps = {
  kind: "loading" | "empty" | "error";
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
};

/** Shared feedback for catalogue, evidence and account requests. */
export function DataState({ kind, title, description, onRetry, retryLabel = "Try again", compact = false }: DataStateProps) {
  return <section className={`data-state data-state--${kind}${compact ? " data-state--compact" : ""}`} role={kind === "error" ? "alert" : "status"} aria-live={kind === "error" ? "assertive" : "polite"}>
    <span className="data-state-icon" aria-hidden="true">{kind === "loading" ? <span className="data-spinner"/> : kind === "error" ? <FiAlertCircle/> : <FiSearch/>}</span>
    <div className="data-state-copy"><p className="data-state-title">{title}</p>{description && <p className="data-state-description">{description}</p>}</div>
    {kind === "error" && onRetry && <button className="data-state-retry" type="button" onClick={onRetry}>{retryLabel}</button>}
    {kind === "loading" && !compact && <div className="data-skeleton" aria-hidden="true"><span/><span/><span/></div>}
  </section>;
}
