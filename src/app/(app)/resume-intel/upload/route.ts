import { NextResponse } from "next/server";
import { z } from "zod";

import { isAiConfigured } from "@/lib/ai/config";
import { startJob } from "@/lib/jobs/runner";
import { RESUME_MAX_BYTES, RESUME_MESSAGES, resumeText } from "@/lib/resume-text";
import { route } from "@/lib/route";

import { critiqueResumeJob } from "../jobs";

/** Names from the page, trimmed to what the job takes: the file's own name and the target to judge against. */
const uploadQuery = z.object({
  fileName: z
    .string()
    .default("")
    .transform((name) => name.slice(0, 200)),
  targetId: z
    .string()
    .default("")
    .transform((id) => id.slice(0, 50)),
});

/**
 * Starts a critique of a resume file, sent as the request body (master.md
 * §5.1): its text is read here, then a job critiques it. A route handler,
 * since Server Actions take at most 1 MB.
 */
export const POST = route(async (request) => {
  if (Number(request.headers.get("content-length") ?? 0) > RESUME_MAX_BYTES) {
    return NextResponse.json({ error: RESUME_MESSAGES.tooBig }, { status: 413 });
  }
  if (!(await isAiConfigured())) {
    return NextResponse.json({ error: "Choose an AI provider in Settings first: it's what critiques the resume." }, { status: 409 });
  }
  const query = uploadQuery.parse(Object.fromEntries(request.nextUrl.searchParams));
  const read = await resumeText(new Uint8Array(await request.arrayBuffer()));
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });
  const jobId = await startJob(critiqueResumeJob, { mode: "FILE", content: read.text, fileName: query.fileName, targetId: query.targetId });
  return NextResponse.json({ jobId });
});
