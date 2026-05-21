import { NextResponse } from "next/server";
import { deleteJob, updateJob } from "../../../lib/db";
import { isAuthenticated } from "../../../lib/auth";
import { normalizeAmount, type Job, type JobFormData } from "../../../lib/jobs";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

function cleanJobInput(input: JobFormData) {
  return {
    customerName: input.customerName.trim(),
    jobAddress: input.jobAddress.trim(),
    jobDescription: input.jobDescription.trim(),
    briefSummary: input.briefSummary.trim(),
    finalAmount: normalizeAmount(input.finalAmount),
    dateCompleted: input.dateCompleted,
    optionalNotes: input.optionalNotes.trim(),
  };
}

function hasRequiredFields(input: ReturnType<typeof cleanJobInput>) {
  return Boolean(
    input.customerName &&
      input.jobAddress &&
      input.jobDescription &&
      input.briefSummary &&
      input.dateCompleted,
  );
}

export async function PUT(request: Request, context: RouteContext) {
  if (!(await isAuthenticated())) {
    return unauthorized();
  }

  const body = (await request.json().catch(() => null)) as
    | (JobFormData & Pick<Job, "createdAt">)
    | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid job payload." }, { status: 400 });
  }

  const cleaned = cleanJobInput(body);

  if (!hasRequiredFields(cleaned)) {
    return NextResponse.json(
      { error: "Missing required job fields." },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const job = await updateJob({
    id,
    ...cleaned,
    createdAt: body.createdAt,
    updatedAt: new Date().toISOString(),
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (!(await isAuthenticated())) {
    return unauthorized();
  }

  const { id } = await context.params;
  const deleted = await deleteJob(id);

  if (!deleted) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
