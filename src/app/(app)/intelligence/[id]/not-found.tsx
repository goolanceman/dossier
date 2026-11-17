import Link from "next/link";

import { ScreenMessage } from "@/components/screen-message";
import { buttonClassName } from "@/components/ui/button";

/** A posting id that doesn't exist, e.g. one that was dismissed for good. */
export default function IntelligenceNotFound() {
  return (
    <ScreenMessage
      title="We couldn't find that posting"
      actions={
        <Link href="/jobs" className={buttonClassName("primary", "md", "hover:text-on-primary")}>
          Back to Find jobs
        </Link>
      }
    >
      <p>It may have been removed, or the link is incomplete. Postings you saved stay in Find jobs.</p>
    </ScreenMessage>
  );
}
