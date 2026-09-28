"use client";

import { useEffect } from "react";
import { FiAlertCircle, FiAlertTriangle, FiCheckCircle, FiX } from "react-icons/fi";

type FeedbackToastProps = {
  error?: string;
  warning?: string;
  success?: string;
  onDismissError?: () => void;
  onDismissWarning?: () => void;
  onDismissSuccess?: () => void;
  onRetry?: () => void;
  retryLabel?: string;
};

function Toast({
  kind,
  message,
  onDismiss,
  onRetry,
  retryLabel,
}: {
  kind: "error" | "warning" | "success";
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const timeoutMs = kind === "error" ? 10000 : 7000;
  useEffect(() => {
    if (!onDismiss) return;
    const timer = window.setTimeout(onDismiss, timeoutMs);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss, timeoutMs]);

  const Icon = kind === "error" ? FiAlertCircle : kind === "warning" ? FiAlertTriangle : FiCheckCircle;
  const title = kind === "error" ? "Action needed" : kind === "warning" ? "Review this" : "Completed";

  return (
    <div className={`feedback-toast feedback-toast--${kind}`} role={kind === "success" ? "status" : "alert"}>
      <span className="feedback-toast-icon" aria-hidden="true"><Icon /></span>
      <div className="feedback-toast-copy">
        <p className="feedback-toast-title">{title}</p>
        <p className="feedback-toast-message">{message}</p>
        {onRetry && <button className="feedback-toast-retry" type="button" onClick={onRetry}>{retryLabel ?? "Try again"}</button>}
      </div>
      {onDismiss && <button className="feedback-toast-dismiss" type="button" onClick={onDismiss} aria-label={`Dismiss ${kind} message`}><FiX /></button>}
      {onDismiss && <span className="feedback-toast-timer" style={{ animationDuration: `${timeoutMs}ms` }} aria-hidden="true" />}
    </div>
  );
}

/** Persistent, dismissible feedback that stays visible while a long form is in view. */
export function FeedbackToast({
  error,
  warning,
  success,
  onDismissError,
  onDismissWarning,
  onDismissSuccess,
  onRetry,
  retryLabel,
}: FeedbackToastProps) {
  if (!error && !warning && !success) return null;

  return (
    <div className="feedback-viewport" aria-live="polite" aria-atomic="false">
      {error && <Toast kind="error" message={error} onDismiss={onDismissError} onRetry={onRetry} retryLabel={retryLabel} />}
      {warning && <Toast kind="warning" message={warning} onDismiss={onDismissWarning} />}
      {success && <Toast kind="success" message={success} onDismiss={onDismissSuccess} />}
    </div>
  );
}
