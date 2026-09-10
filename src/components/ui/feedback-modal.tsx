"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { Modal } from "./modal";
import { Button } from "./button";

/* =============================================================================
   Design System Feedback Modal (Replaces browser alert() popup).
   Styled with custom typography, clean tokens, and smooth entrance.
   ============================================================================= */

export interface FeedbackModalState {
  isOpen: boolean;
  type: "success" | "error" | "info";
  title: string;
  message: string;
}

export function FeedbackModal({
  state,
  onClose,
}: {
  state: FeedbackModalState;
  onClose: () => void;
}) {
  if (!state.isOpen) return null;

  const icons = {
    success: <CheckCircle2 className="size-8 text-emerald-600" />,
    error: <AlertCircle className="size-8 text-red-600" />,
    info: <Info className="size-8 text-neutral-900" />,
  };

  const bgIcons = {
    success: "bg-emerald-50",
    error: "bg-red-50",
    info: "bg-neutral-100",
  };

  return (
    <Modal
      open={state.isOpen}
      onClose={onClose}
      title=""
      className="max-w-md"
      footer={
        <Button onClick={onClose} className="w-full sm:w-auto font-bold">
          Mengerti
        </Button>
      }
    >
      <div className="flex flex-col items-center text-center space-y-4 pt-2">
        <div className={`size-16 rounded-full flex items-center justify-center ${bgIcons[state.type]}`}>
          {icons[state.type]}
        </div>
        <div className="space-y-1.5">
          <h3 className="text-xl font-extrabold tracking-tight text-neutral-900">
            {state.title}
          </h3>
          <p className="text-xs text-neutral-500 leading-relaxed max-w-sm">
            {state.message}
          </p>
        </div>
      </div>
    </Modal>
  );
}
