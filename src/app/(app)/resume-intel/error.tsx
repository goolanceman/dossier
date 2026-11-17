"use client";

import { ScreenError, type ErrorPageProps } from "@/components/screen-error";

export default function ResumeIntelError(props: ErrorPageProps) {
  return <ScreenError {...props} title="Resume intelligence didn't load" />;
}
