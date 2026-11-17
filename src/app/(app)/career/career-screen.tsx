"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/cn";

import { CAREER_SECTIONS, careerSectionHref, type CareerSectionId } from "./sections";

/**
 * The career screen (master.md Phase 1): the section list on the left, the
 * section on the right, stacked on narrow windows, like Settings. The
 * section is in `?section=`, so Back returns to it.
 */
export function CareerScreen({ section, children }: { section: CareerSectionId; children: ReactNode }) {
  return (
    <>
      <PageHeader
        title="Career"
        description="The evidence behind your applications: what you have done and can prove, the roles you are aiming at, and your own documents read into findings and drafts."
      />
      <div className="flex flex-wrap items-start gap-x-12 gap-y-8 px-10 pb-20">
        <nav aria-label="Career sections" className="flex max-w-[220px] min-w-[200px] flex-[1_1_200px] flex-col gap-0.5">
          {CAREER_SECTIONS.map((entry) => (
            <Link
              key={entry.id}
              href={careerSectionHref(entry.id)}
              aria-current={entry.id === section ? "page" : undefined}
              className={cn(
                "rounded-control px-3 py-[9px] text-sm text-ink hover:bg-hover hover:text-ink",
                entry.id === section && "bg-selected font-medium hover:bg-selected",
              )}
            >
              {entry.label}
            </Link>
          ))}
        </nav>
        <div className="flex max-w-[860px] min-w-0 flex-[999_1_420px] flex-col gap-5">{children}</div>
      </div>
    </>
  );
}
