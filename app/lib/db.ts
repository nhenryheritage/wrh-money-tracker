import { Pool } from "pg";
import type { Job } from "./jobs";

type JobRow = {
  id: string;
  customer_name: string;
  job_address: string;
  job_description: string;
  brief_summary: string;
  final_amount: string;
  date_completed: string;
  optional_notes: string | null;
  created_at: Date;
  updated_at: Date;
};

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

const globalForPool = globalThis as typeof globalThis & {
  wrhMoneyTrackerPool?: Pool;
  wrhMoneyTrackerSchemaReady?: Promise<void>;
};

function getPool() {
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
  }

  if (!globalForPool.wrhMoneyTrackerPool) {
    globalForPool.wrhMoneyTrackerPool = new Pool({
      connectionString,
      ssl:
        connectionString.includes("localhost") ||
        connectionString.includes("127.0.0.1")
          ? undefined
          : { rejectUnauthorized: false },
    });
  }

  return globalForPool.wrhMoneyTrackerPool;
}

export async function ensureSchema() {
  if (!globalForPool.wrhMoneyTrackerSchemaReady) {
    globalForPool.wrhMoneyTrackerSchemaReady = getPool().query(`
      create table if not exists jobs (
        id text primary key,
        customer_name text not null,
        job_address text not null,
        job_description text not null,
        brief_summary text not null,
        final_amount numeric(12, 2) not null default 0,
        date_completed date not null,
        optional_notes text not null default '',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create index if not exists jobs_customer_name_idx on jobs (lower(customer_name));
      create index if not exists jobs_date_completed_idx on jobs (date_completed desc);
    `).then(() => undefined);
  }

  await globalForPool.wrhMoneyTrackerSchemaReady;
}

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    customerName: row.customer_name,
    jobAddress: row.job_address,
    jobDescription: row.job_description,
    briefSummary: row.brief_summary,
    finalAmount: Number(row.final_amount),
    dateCompleted: row.date_completed,
    optionalNotes: row.optional_notes ?? "",
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listJobs() {
  await ensureSchema();

  const result = await getPool().query<JobRow>(`
    select
      id,
      customer_name,
      job_address,
      job_description,
      brief_summary,
      final_amount::text,
      to_char(date_completed, 'YYYY-MM-DD') as date_completed,
      optional_notes,
      created_at,
      updated_at
    from jobs
    order by date_completed desc, created_at desc
  `);

  return result.rows.map(toJob);
}

export async function createJob(job: Job) {
  await ensureSchema();

  const result = await getPool().query<JobRow>(
    `
      insert into jobs (
        id,
        customer_name,
        job_address,
        job_description,
        brief_summary,
        final_amount,
        date_completed,
        optional_notes,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      returning
        id,
        customer_name,
        job_address,
        job_description,
        brief_summary,
        final_amount::text,
        to_char(date_completed, 'YYYY-MM-DD') as date_completed,
        optional_notes,
        created_at,
        updated_at
    `,
    [
      job.id,
      job.customerName,
      job.jobAddress,
      job.jobDescription,
      job.briefSummary,
      job.finalAmount,
      job.dateCompleted,
      job.optionalNotes,
      job.createdAt,
      job.updatedAt,
    ],
  );

  return toJob(result.rows[0]);
}

export async function updateJob(job: Job) {
  await ensureSchema();

  const result = await getPool().query<JobRow>(
    `
      update jobs
      set
        customer_name = $2,
        job_address = $3,
        job_description = $4,
        brief_summary = $5,
        final_amount = $6,
        date_completed = $7,
        optional_notes = $8,
        updated_at = $9
      where id = $1
      returning
        id,
        customer_name,
        job_address,
        job_description,
        brief_summary,
        final_amount::text,
        to_char(date_completed, 'YYYY-MM-DD') as date_completed,
        optional_notes,
        created_at,
        updated_at
    `,
    [
      job.id,
      job.customerName,
      job.jobAddress,
      job.jobDescription,
      job.briefSummary,
      job.finalAmount,
      job.dateCompleted,
      job.optionalNotes,
      job.updatedAt,
    ],
  );

  return result.rows[0] ? toJob(result.rows[0]) : null;
}

export async function deleteJob(id: string) {
  await ensureSchema();

  const result = await getPool().query("delete from jobs where id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}
