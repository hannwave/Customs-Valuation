"use client";

import { useToastMessage } from "@/components/Toaster";

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

/** Error, warning and success messages shown through the portal-wide toaster (with sound). */
export function FeedbackToast({ error, warning, success, onDismissError, onDismissWarning, onDismissSuccess, onRetry, retryLabel }: FeedbackToastProps) {
  useToastMessage("error", error, onDismissError, onRetry ? { action: { label: retryLabel ?? "Try again", onClick: onRetry } } : {});
  useToastMessage("warning", warning, onDismissWarning);
  useToastMessage("success", success, onDismissSuccess);
  return null;
}
