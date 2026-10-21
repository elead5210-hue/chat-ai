import React from "react";
import { countSatisfied, hasChecklist } from "../../state/checklistStore.js";

/**
 * Shows the completion checklist: each item with its satisfied/pending state
 * and a count of how many items are satisfied. Renders nothing until the AI
 * has defined a checklist (after phase one completes).
 *
 * Props supplied by ConversationPanel:
 *   checklist - [{ id, label, satisfied }]
 */
export default function ChecklistProgress({ checklist = [] }) {
  if (!hasChecklist(checklist)) return null;

  const satisfied = countSatisfied(checklist);
  const total = checklist.length;

  return (
    <section className="checklist-progress" data-area="checklist" aria-label="Checklist">
      <h3 className="checklist-title">
        Checklist
        <span className="checklist-count">
          {satisfied} of {total} satisfied
        </span>
      </h3>
      <ul className="checklist-items">
        {checklist.map((item) => {
          const done = item.satisfied === true;
          return (
            <li
              key={item.id}
              className={`checklist-item ${done ? "checklist-item-done" : "checklist-item-pending"}`}
              data-satisfied={done ? "true" : "false"}
            >
              <span className="checklist-mark" aria-hidden="true">
                {done ? "\u2713" : "\u25CB"}
              </span>
              <span className="checklist-label">{item.label}</span>
              <span className="visually-hidden">{done ? " (satisfied)" : " (pending)"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}