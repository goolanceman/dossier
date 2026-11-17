"use client";

import { ScreenError, type ErrorPageProps } from "@/components/screen-error";

export default function InterviewError(props: ErrorPageProps) {
  return <ScreenError {...props} title="Your interview prep didn't load" />;
}
