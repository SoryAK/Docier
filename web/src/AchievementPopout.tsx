import { useEffect, useRef } from "react";
import type { WorkMapRole } from "@core/work-map";
import { X } from "lucide-react";
import { AchievementDetail } from "./AchievementDetail";

/**
 * An achievement opened from the role's History, in a window over the page,
 * so the role stays where it was. Closes with ×, Escape, or a click outside.
 */
export function AchievementPopout({
  role,
  achievementId,
  onClose,
  onSaved,
}: {
  role: WorkMapRole;
  achievementId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="achievement-popout"
      aria-label="Achievement"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="achievement-popout-body">
        <button type="button" className="role-view-round achievement-popout-close" aria-label="Close" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
        <AchievementDetail role={role} achievementId={achievementId} onBack={onClose} onSaved={onSaved} backLabel={null} />
      </div>
    </dialog>
  );
}
