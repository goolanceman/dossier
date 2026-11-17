import { EvidenceStatus, KnowledgeDocStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";

// Status pills. IMPORTED never reads as verified (master.md §13): it says
// "Imported (unverified)" so AI-drafted evidence can't pass as checked.

const EVIDENCE_BADGES: Record<EvidenceStatus, { label: string; className: string }> = {
  VERIFIED: { label: "Verified", className: "text-success" },
  USER_CONFIRMED: { label: "Confirmed", className: "text-ink" },
  IMPORTED: { label: "Imported (unverified)", className: "text-muted" },
  NEEDS_CLARIFICATION: { label: "Needs clarification", className: "bg-warning-surface text-warning" },
  REJECTED: { label: "Rejected", className: "bg-danger-surface text-danger" },
};

/** An achievement's evidence status, as an honest pill. */
export function EvidenceBadge({ status }: { status: EvidenceStatus }) {
  const badge = EVIDENCE_BADGES[status];
  return <span className={cn("inline-flex w-fit items-center rounded-full bg-track px-2.5 py-0.5 text-meta", badge.className)}>{badge.label}</span>;
}

const DOC_BADGES: Record<KnowledgeDocStatus, { label: string; className: string }> = {
  NEW: { label: "New", className: "text-muted" },
  REVIEWED: { label: "Reviewed", className: "text-success" },
  ARCHIVED: { label: "Archived", className: "text-muted" },
};

/** A knowledge doc's status, as a pill. */
export function DocStatusBadge({ status }: { status: KnowledgeDocStatus }) {
  const badge = DOC_BADGES[status];
  return <span className={cn("inline-flex w-fit items-center rounded-full bg-track px-2.5 py-0.5 text-meta", badge.className)}>{badge.label}</span>;
}
