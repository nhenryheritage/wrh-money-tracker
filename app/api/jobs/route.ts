import { NextResponse } from "next/server";
import { createJob, listJobs } from "../../lib/db";
import { isAuthenticated } from "../../lib/auth";
import { normalizeAmount, type JobFormData } from "../../lib/jobs";

export const runtime = "nodejs";

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

export async function GET() {
  if (!(await isAuthenticated())) {
    return unauthorized();
  }

  try {
    return NextResponse.json({ jobs: await listJobs() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load jobs." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return unauthorized();
  }

  const body = (await request.json().catch(() => null)) as JobFormData | null;

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

  const now = new Date().toISOString();
  const job = await createJob({
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}`,
    ...cleaned,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ job }, { status: 201 });
}
