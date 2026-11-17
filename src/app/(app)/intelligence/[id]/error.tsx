"use client";

import { ScreenError, type ErrorPageProps } from "@/components/screen-error";

export default function IntelligenceError(props: ErrorPageProps) {
  return <ScreenError {...props} title="The job's intelligence didn't load" />;
}
