"use client";

import { ScreenError, type ErrorPageProps } from "@/components/screen-error";

export default function CareerError(props: ErrorPageProps) {
  return <ScreenError {...props} title="Your career library didn't load" />;
}
