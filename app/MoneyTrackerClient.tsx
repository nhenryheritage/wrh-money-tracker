"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  buildCustomerProfiles,
  normalizeCustomerKey,
  type CustomerProfile,
  type Job,
  type JobFormData,
} from "./lib/jobs";

type ViewProps = {
  jobs: Job[];
  filteredJobs: Job[];
  customerProfiles: CustomerProfile[];
  customerNames: string[];
  formData: JobFormData;
  editingJobId: string | null;
  pendingDeleteJobId: string | null;
  searchTerm: string;
  stats: Stat[];
  isSaving: boolean;
  statusMessage: string;
  isDarkMode: boolean;
  setSearchTerm: (value: string) => void;
  setPendingDeleteJobId: (jobId: string | null) => void;
  updateFormField: (field: keyof JobFormData, value: string) => void;
  resetForm: () => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
  handleEdit: (job: Job) => void;
  handleDelete: (jobId: string) => void;
};

type Stat = {
  label: string;
  value: string | number;
  detail: string;
};

type ThemeMode = "light" | "dark";

const themeStorageKey = "wrh-money-tracker.theme.v1";

const emptyForm: JobFormData = {
  customerName: "",
  jobAddress: "",
  jobDescription: "",
  briefSummary: "",
  finalAmount: "",
  dateCompleted: new Date().toISOString().slice(0, 10),
  optionalNotes: "",
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatCurrency(amount: number) {
  return currencyFormatter.format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(dateValue: string) {
  if (!dateValue) {
    return "Not set";
  }

  const date = new Date(`${dateValue}T00:00:00`);
  return Number.isNaN(date.getTime()) ? dateValue : dateFormatter.format(date);
}

export default function MoneyTrackerClient() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [formData, setFormData] = useState<JobFormData>(emptyForm);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [pendingDeleteJobId, setPendingDeleteJobId] = useState<string | null>(
    null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [authStatus, setAuthStatus] = useState<"checking" | "in" | "out">(
    "checking",
  );
  const [password, setPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [hasLoadedTheme, setHasLoadedTheme] = useState(false);
  const isDarkMode = themeMode === "dark";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.queueMicrotask(() => {
      const storedTheme = window.localStorage.getItem(themeStorageKey);

      if (storedTheme === "dark" || storedTheme === "light") {
        setThemeMode(storedTheme);
      }

      setHasLoadedTheme(true);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoadedTheme) {
      return;
    }

    window.localStorage.setItem(themeStorageKey, themeMode);
  }, [hasLoadedTheme, themeMode]);

  const loadJobs = useCallback(async () => {
    const response = await fetch("/api/jobs");

    if (response.status === 401) {
      setAuthStatus("out");
      setJobs([]);
      return;
    }

    const data = (await response.json().catch(() => null)) as {
      jobs?: Job[];
      error?: string;
    } | null;

    if (!response.ok) {
      setStatusMessage(data?.error || "Unable to load jobs.");
      return;
    }

    setJobs(Array.isArray(data?.jobs) ? data.jobs : []);
    setStatusMessage("");
  }, []);

  const checkSession = useCallback(async () => {
    const response = await fetch("/api/auth/session");
    const data = (await response.json().catch(() => null)) as {
      authenticated?: boolean;
    } | null;

    if (data?.authenticated) {
      setAuthStatus("in");
      await loadJobs();
      return;
    }

    setAuthStatus("out");
  }, [loadJobs]);

  useEffect(() => {
    // The app needs one startup request to find out whether the HttpOnly auth cookie is valid.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void checkSession();
  }, [checkSession]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setStatusMessage("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    setIsSaving(false);

    if (!response.ok) {
      setStatusMessage(data?.error || "Unable to log in.");
      return;
    }

    setPassword("");
    setAuthStatus("in");
    await loadJobs();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setJobs([]);
    setAuthStatus("out");
    resetForm();
  }

  const totalRevenue = useMemo(
    () => jobs.reduce((sum, job) => sum + job.finalAmount, 0),
    [jobs],
  );

  const mostRecentDate = useMemo(() => {
    if (jobs.length === 0) {
      return "No jobs yet";
    }

    const sortedDates = jobs
      .map((job) => job.dateCompleted)
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a));

    return sortedDates[0] ? formatDate(sortedDates[0]) : "No date set";
  }, [jobs]);

  const averageRevenue = jobs.length > 0 ? totalRevenue / jobs.length : 0;

  const customerNames = useMemo(
    () =>
      Array.from(
        new Map(
          jobs.map((job) => [normalizeCustomerKey(job.customerName), job.customerName]),
        ).values(),
      ).sort((a, b) => a.localeCompare(b)),
    [jobs],
  );

  const filteredJobs = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    const sortedJobs = [...jobs].sort((a, b) => {
      const dateCompare = b.dateCompleted.localeCompare(a.dateCompleted);
      return dateCompare || b.createdAt.localeCompare(a.createdAt);
    });

    if (!query) {
      return sortedJobs;
    }

    return sortedJobs.filter((job) =>
      [
        job.customerName,
        job.jobAddress,
        job.jobDescription,
        job.briefSummary,
      ].some((field) => field.toLowerCase().includes(query)),
    );
  }, [jobs, searchTerm]);

  const customerProfiles = useMemo(
    () => buildCustomerProfiles(filteredJobs),
    [filteredJobs],
  );

  const totalCustomerProfiles = useMemo(
    () => buildCustomerProfiles(jobs).length,
    [jobs],
  );

  const stats: Stat[] = [
    {
      label: "Completed jobs",
      value: jobs.length,
      detail: `${filteredJobs.length} visible`,
    },
    {
      label: "Customer profiles",
      value: totalCustomerProfiles,
      detail: `${customerProfiles.length} visible`,
    },
    {
      label: "Total revenue",
      value: formatCurrency(totalRevenue),
      detail: "All recorded work",
    },
    {
      label: "Average job",
      value: formatCurrency(averageRevenue),
      detail: "Revenue per job",
    },
    {
      label: "Latest completion",
      value: mostRecentDate,
      detail: "Most recent date",
    },
  ];

  function updateFormField(field: keyof JobFormData, value: string) {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetForm() {
    setFormData({
      ...emptyForm,
      dateCompleted: new Date().toISOString().slice(0, 10),
    });
    setEditingJobId(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload: JobFormData = {
      customerName: formData.customerName.trim(),
      jobAddress: formData.jobAddress.trim(),
      jobDescription: formData.jobDescription.trim(),
      briefSummary: formData.briefSummary.trim(),
      finalAmount: formData.finalAmount,
      dateCompleted: formData.dateCompleted,
      optionalNotes: formData.optionalNotes.trim(),
    };

    if (
      !payload.customerName ||
      !payload.jobAddress ||
      !payload.jobDescription ||
      !payload.briefSummary ||
      !payload.dateCompleted
    ) {
      return;
    }

    setIsSaving(true);
    setStatusMessage("");

    const originalJob = editingJobId
      ? jobs.find((job) => job.id === editingJobId)
      : null;
    const response = await fetch(
      editingJobId ? `/api/jobs/${editingJobId}` : "/api/jobs",
      {
        method: editingJobId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          createdAt: originalJob?.createdAt,
        }),
      },
    );
    const data = (await response.json().catch(() => null)) as {
      job?: Job;
      error?: string;
    } | null;

    setIsSaving(false);

    if (!response.ok || !data?.job) {
      if (response.status === 401) {
        setAuthStatus("out");
      }

      setStatusMessage(data?.error || "Unable to save job.");
      return;
    }

    setJobs((currentJobs) => {
      if (editingJobId) {
        return currentJobs.map((job) =>
          job.id === editingJobId ? data.job! : job,
        );
      }

      return [data.job!, ...currentJobs];
    });
    resetForm();
  }

  function handleEdit(job: Job) {
    setEditingJobId(job.id);
    setPendingDeleteJobId(null);
    setFormData({
      customerName: job.customerName,
      jobAddress: job.jobAddress,
      jobDescription: job.jobDescription,
      briefSummary: job.briefSummary,
      finalAmount: job.finalAmount.toString(),
      dateCompleted: job.dateCompleted,
      optionalNotes: job.optionalNotes,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(jobId: string) {
    setIsSaving(true);
    setStatusMessage("");

    const response = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    setIsSaving(false);

    if (!response.ok) {
      if (response.status === 401) {
        setAuthStatus("out");
      }

      setStatusMessage(data?.error || "Unable to delete job.");
      return;
    }

    setJobs((currentJobs) => currentJobs.filter((job) => job.id !== jobId));

    if (editingJobId === jobId) {
      resetForm();
    }

    setPendingDeleteJobId(null);
  }

  const viewProps: ViewProps = {
    jobs,
    filteredJobs,
    customerProfiles,
    customerNames,
    formData,
    editingJobId,
    pendingDeleteJobId,
    searchTerm,
    stats,
    isSaving,
    statusMessage,
    isDarkMode,
    setSearchTerm,
    setPendingDeleteJobId,
    updateFormField,
    resetForm,
    handleSubmit,
    handleEdit,
    handleDelete,
  };

  return (
    <main
      className={`min-h-screen transition-colors ${
        isDarkMode ? "bg-[#0f1724] text-white" : "bg-[#fcfaf8] text-[#11233b]"
      }`}
    >
      <div className="sticky top-0 z-20 border-b border-[#f96d10]/35 bg-[#122b4a] px-4 py-4 text-white shadow-sm sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#f96d10]">
              WRH Money Tracker
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Completed Job Log
            </h1>
          </div>
          <p className="text-sm font-semibold text-white/85">
            Western Reserve Handyman
          </p>
          {authStatus === "in" ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={isDarkMode}
                onClick={() =>
                  setThemeMode((currentTheme) =>
                    currentTheme === "dark" ? "light" : "dark",
                  )
                }
                className="w-fit rounded-lg border border-[#f96d10]/70 bg-[#f96d10]/15 px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#f96d10]/25"
              >
                {isDarkMode ? "Light mode" : "Dark mode"}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="w-fit rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Log out
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {authStatus === "checking" ? (
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <Panel className="p-6" dark={isDarkMode}>
            <p
              className={`text-sm font-semibold ${
                isDarkMode ? "text-[#c6d1c6]" : "text-[#4f5e72]"
              }`}
            >
              Checking access...
            </p>
          </Panel>
        </div>
      ) : null}

      {authStatus === "out" ? (
        <LoginPanel
          password={password}
          statusMessage={statusMessage}
          isSaving={isSaving}
          isDarkMode={isDarkMode}
          setPassword={setPassword}
          handleLogin={handleLogin}
        />
      ) : null}

      {authStatus === "in" ? <LedgerView {...viewProps} /> : null}
    </main>
  );
}

function LoginPanel({
  password,
  statusMessage,
  isSaving,
  isDarkMode,
  setPassword,
  handleLogin,
}: {
  password: string;
  statusMessage: string;
  isSaving: boolean;
  isDarkMode: boolean;
  setPassword: (value: string) => void;
  handleLogin: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:px-6 lg:px-8">
      <form
        onSubmit={handleLogin}
        className={`rounded-lg border p-6 shadow-sm ${
          isDarkMode
            ? "border-white/10 bg-[#17211b] text-white"
            : "border-[#e4dcd3] bg-white text-[#11233b]"
        }`}
      >
        <h2 className="text-xl font-semibold">Sign in</h2>
        <p
          className={`mt-2 text-sm leading-6 ${
            isDarkMode ? "text-[#c6d1c6]" : "text-[#4f5e72]"
          }`}
        >
          Enter the tracker password to view and update customer records.
        </p>

        <label className="mt-5 block">
          <span
            className={`mb-2 block text-sm font-semibold ${
              isDarkMode ? "text-[#c6d1c6]" : "text-[#11233b]"
            }`}
          >
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={`w-full rounded-lg border px-3 py-3 text-sm outline-none transition ${
              isDarkMode
                ? "border-white/10 bg-white/5 text-white focus:border-[#d7e7cf] focus:ring-4 focus:ring-white/10"
                : "border-[#e4dcd3] bg-white text-[#11233b] focus:border-[#f96d10] focus:ring-4 focus:ring-[#f96d10]/20"
            }`}
            required
          />
        </label>

        {statusMessage ? (
          <p className="mt-3 rounded-lg bg-[#fff3f1] px-3 py-2 text-sm text-[#a2372f]">
            {statusMessage}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSaving}
          className="mt-5 w-full rounded-lg bg-[#f96d10] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#df5e06] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

function LedgerView(props: ViewProps) {
  const tone = props.isDarkMode ? "dark" : "light";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <StatsGrid stats={props.stats.slice(0, 3)} tone={tone} />

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <div className="space-y-4">
          <JobForm {...props} tone={tone} />
        </div>
        <section className="space-y-4">
          <Panel className="p-4" dark={props.isDarkMode}>
            <SearchBox
              searchTerm={props.searchTerm}
              setSearchTerm={props.setSearchTerm}
              label="Search completed jobs"
              tone={tone}
            />
          </Panel>
          <ListHeader
            customerProfiles={props.customerProfiles}
            filteredJobs={props.filteredJobs}
            jobs={props.jobs}
            dark={props.isDarkMode}
          />
          <div className="grid gap-4">
            {props.customerProfiles.length > 0 ? (
              props.customerProfiles.map((profile) => (
                <CustomerProfileCard
                  key={profile.key}
                  profile={profile}
                  {...props}
                />
              ))
            ) : (
              <EmptyState tone={tone} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatsGrid({
  stats,
  tone = "light",
}: {
  stats: Stat[];
  tone?: "light" | "dark";
}) {
  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`min-w-0 rounded-lg border p-4 ${
            tone === "dark"
              ? "border-white/10 bg-white/5 text-white"
              : "border-[#e4dcd3] bg-white text-[#11233b] shadow-sm"
          }`}
        >
          <p
            className={`text-[0.68rem] font-semibold uppercase leading-5 tracking-[0.06em] break-words ${
              tone === "dark" ? "text-[#9fb39f]" : "text-[#387559]"
            }`}
          >
            {stat.label}
          </p>
          <p className="mt-2 max-w-full break-words text-[clamp(1.05rem,3vw,1.35rem)] font-semibold leading-tight tabular-nums [overflow-wrap:anywhere]">
            {stat.value}
          </p>
          <p
            className={`mt-1 max-w-full break-words text-sm leading-5 ${
              tone === "dark" ? "text-[#c6d1c6]" : "text-[#4f5e72]"
            }`}
          >
            {stat.detail}
          </p>
        </div>
      ))}
    </section>
  );
}

function Panel({
  children,
  className = "",
  dark = false,
}: {
  children: React.ReactNode;
  className?: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border shadow-sm ${
        dark ? "border-white/10 bg-[#17211b]" : "border-[#e4dcd3] bg-white"
      } ${className}`}
    >
      {children}
    </div>
  );
}

function JobForm({
  formData,
  editingJobId,
  customerNames,
  isSaving,
  statusMessage,
  updateFormField,
  resetForm,
  handleSubmit,
  tone = "light",
  compact = false,
}: ViewProps & {
  tone?: "light" | "dark" | "field" | "minimal";
  compact?: boolean;
}) {
  const isDark = tone === "dark";

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-lg border p-5 ${
        isDark
          ? "border-white/10 bg-[#17211b] text-white"
          : tone === "field"
            ? "border-[#e4dcd3] bg-[#fcfaf8] text-[#11233b] shadow-sm"
            : "border-[#e4dcd3] bg-white text-[#11233b] shadow-sm"
      }`}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {editingJobId ? "Edit completed job" : "Add completed job"}
          </h2>
          <p
            className={`mt-1 text-sm ${
              isDark ? "text-[#c6d1c6]" : "text-[#4f5e72]"
            }`}
          >
            Record the work, amount, and completion date.
          </p>
        </div>
        {editingJobId ? (
          <button
            type="button"
            onClick={resetForm}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              isDark
                ? "border-white/15 text-white hover:bg-white/10"
                : "border-[#e4dcd3] text-[#122b4a] hover:bg-[#fcfaf8]"
            }`}
          >
            Cancel
          </button>
        ) : null}
      </div>

      <div className={compact ? "grid gap-3" : "grid gap-4"}>
        <TextField
          label="Customer Name"
          value={formData.customerName}
          onChange={(value) => updateFormField("customerName", value)}
          suggestions={customerNames}
          required
          dark={isDark}
        />
        <TextField
          label="Job Address"
          value={formData.jobAddress}
          onChange={(value) => updateFormField("jobAddress", value)}
          required
          dark={isDark}
        />
        <TextArea
          label="Job Description"
          value={formData.jobDescription}
          onChange={(value) => updateFormField("jobDescription", value)}
          required
          dark={isDark}
          rows={compact ? 2 : 3}
        />
        <TextArea
          label="Brief Summary"
          value={formData.briefSummary}
          onChange={(value) => updateFormField("briefSummary", value)}
          required
          dark={isDark}
          rows={compact ? 2 : 3}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Final Amount"
            type="number"
            min="0"
            step="0.01"
            value={formData.finalAmount}
            onChange={(value) => updateFormField("finalAmount", value)}
            required
            dark={isDark}
          />
          <TextField
            label="Date Completed"
            type="date"
            value={formData.dateCompleted}
            onChange={(value) => updateFormField("dateCompleted", value)}
            required
            dark={isDark}
          />
        </div>
        <TextArea
          label="Optional Notes"
          value={formData.optionalNotes}
          onChange={(value) => updateFormField("optionalNotes", value)}
          dark={isDark}
          rows={compact ? 2 : 3}
        />
      </div>

      {statusMessage ? (
        <p className="mt-5 rounded-lg bg-[#fff3f1] px-3 py-2 text-sm text-[#a2372f]">
          {statusMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSaving}
        className={`mt-5 w-full rounded-lg px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-4 ${
          isDark
            ? "bg-[#d7e7cf] text-[#101713] hover:bg-white focus:ring-white/20"
            : "bg-[#f96d10] text-white hover:bg-[#df5e06] focus:ring-[#f96d10]/25"
        }`}
      >
        {isSaving
          ? "Saving..."
          : editingJobId
            ? "Save edited job"
            : "Add completed job"}
      </button>
    </form>
  );
}

function SearchBox({
  searchTerm,
  setSearchTerm,
  label,
  tone = "light",
}: {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  label: string;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";

  return (
    <label className="block">
      <span
        className={`mb-2 block text-sm font-semibold ${
          dark ? "text-[#c6d1c6]" : "text-[#11233b]"
        }`}
      >
        {label}
      </span>
      <input
        type="search"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        placeholder="Customer, address, description, or summary"
        className={`w-full rounded-lg border px-3 py-3 text-sm outline-none transition ${
          dark
            ? "border-white/10 bg-white/5 text-white placeholder:text-[#879687] focus:border-[#d7e7cf] focus:ring-4 focus:ring-white/10"
            : "border-[#e4dcd3] bg-white text-[#11233b] placeholder:text-[#4f5e72]/70 focus:border-[#f96d10] focus:ring-4 focus:ring-[#f96d10]/20"
        }`}
      />
    </label>
  );
}

function ListHeader({
  customerProfiles,
  filteredJobs,
  jobs,
  dark = false,
}: {
  customerProfiles: CustomerProfile[];
  filteredJobs: Job[];
  jobs: Job[];
  dark?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2
        className={`text-lg font-semibold ${
          dark ? "text-white" : "text-[#11233b]"
        }`}
      >
        Customer profiles
      </h2>
      <p className={`text-sm ${dark ? "text-[#c6d1c6]" : "text-[#4f5e72]"}`}>
        Showing {customerProfiles.length} profiles / {filteredJobs.length} of{" "}
        {jobs.length} jobs
      </p>
    </div>
  );
}

function CustomerProfileCard({
  profile,
  handleEdit,
  handleDelete,
  pendingDeleteJobId,
  setPendingDeleteJobId,
  isDarkMode,
}: ViewProps & {
  profile: CustomerProfile;
}) {
  return (
    <article
      className={`overflow-hidden rounded-lg border shadow-sm ${
        isDarkMode
          ? "border-white/10 bg-[#17211b]"
          : "border-[#e4dcd3] bg-white"
      }`}
    >
      <div
        className={`border-b p-5 ${
          isDarkMode
            ? "border-white/10 bg-white/5"
            : "border-[#e4dcd3] bg-[#fcfaf8]"
        }`}
      >
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,280px)] md:items-start">
          <div className="min-w-0">
            <p
              className={`text-xs font-semibold uppercase tracking-[0.12em] ${
                isDarkMode ? "text-[#9fb39f]" : "text-[#387559]"
              }`}
            >
              Customer profile
            </p>
            <h3
              className={`mt-1 break-words text-xl font-semibold leading-tight ${
                isDarkMode ? "text-white" : "text-[#11233b]"
              }`}
            >
              {profile.customerName}
            </h3>
            <p
              className={`mt-1 break-words text-sm leading-5 ${
                isDarkMode ? "text-[#c6d1c6]" : "text-[#4f5e72]"
              }`}
            >
              Latest address: {profile.latestAddress}
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-3 gap-2 text-left sm:text-right">
            <ProfileMetric
              label="Jobs"
              value={profile.jobCount}
              dark={isDarkMode}
            />
            <ProfileMetric
              label="Total"
              value={formatCurrency(profile.totalRevenue)}
              dark={isDarkMode}
            />
            <ProfileMetric
              label="Latest"
              value={formatDate(profile.latestDate)}
              dark={isDarkMode}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-4">
        {profile.jobs.map((job) => (
          <CustomerJobItem
            key={job.id}
            job={job}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
            pendingDeleteJobId={pendingDeleteJobId}
            setPendingDeleteJobId={setPendingDeleteJobId}
            dark={isDarkMode}
          />
        ))}
      </div>
    </article>
  );
}

function ProfileMetric({
  label,
  value,
  dark = false,
}: {
  label: string;
  value: string | number;
  dark?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p
        className={`truncate text-xs font-semibold uppercase tracking-[0.08em] ${
          dark ? "text-[#c6d1c6]" : "text-[#4f5e72]"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-1 break-words text-sm font-semibold leading-5 ${
          dark ? "text-white" : "text-[#11233b]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CustomerJobItem({
  job,
  handleEdit,
  handleDelete,
  pendingDeleteJobId,
  setPendingDeleteJobId,
  dark = false,
}: {
  job: Job;
  handleEdit: (job: Job) => void;
  handleDelete: (jobId: string) => void;
  pendingDeleteJobId: string | null;
  setPendingDeleteJobId: (jobId: string | null) => void;
  dark?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        dark ? "border-white/10 bg-[#111a28]" : "border-[#e4dcd3] bg-white"
      }`}
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <p
            className={`break-words text-sm font-semibold leading-5 ${
              dark ? "text-white" : "text-[#11233b]"
            }`}
          >
            {job.briefSummary}
          </p>
          <p
            className={`mt-1 break-words text-sm leading-5 ${
              dark ? "text-[#c6d1c6]" : "text-[#4f5e72]"
            }`}
          >
            {job.jobAddress}
          </p>
        </div>
        <ActionButtons
          job={job}
          handleEdit={handleEdit}
          handleDelete={handleDelete}
          pendingDeleteJobId={pendingDeleteJobId}
          setPendingDeleteJobId={setPendingDeleteJobId}
          dark={dark}
        />
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <JobDetail
          label="Amount"
          value={formatCurrency(job.finalAmount)}
          dark={dark}
        />
        <JobDetail
          label="Completed"
          value={formatDate(job.dateCompleted)}
          dark={dark}
        />
        <JobDetail label="Work" value={job.jobDescription} dark={dark} />
      </dl>

      {job.optionalNotes ? (
        <p
          className={`mt-3 break-words rounded-lg px-3 py-2 text-sm leading-6 ${
            dark ? "bg-white/5 text-[#c6d1c6]" : "bg-[#fcfaf8] text-[#4f5e72]"
          }`}
        >
          {job.optionalNotes}
        </p>
      ) : null}
    </div>
  );
}

function ActionButtons({
  job,
  handleEdit,
  handleDelete,
  pendingDeleteJobId,
  setPendingDeleteJobId,
  dark = false,
  align = "left",
}: {
  job: Job;
  handleEdit: (job: Job) => void;
  handleDelete: (jobId: string) => void;
  pendingDeleteJobId: string | null;
  setPendingDeleteJobId: (jobId: string | null) => void;
  dark?: boolean;
  align?: "left" | "right";
}) {
  if (pendingDeleteJobId === job.id) {
    return (
      <div
        className={`flex shrink-0 flex-wrap gap-2 ${
          align === "right" ? "justify-end" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => handleDelete(job.id)}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
            dark
              ? "bg-[#ffd1cc] text-[#2b1512] hover:bg-white"
              : "bg-[#a2372f] text-white hover:bg-[#842b25]"
          }`}
        >
          Confirm delete
        </button>
        <button
          type="button"
          onClick={() => setPendingDeleteJobId(null)}
          className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
            dark
              ? "border-white/15 text-white hover:bg-white/10"
              : "border-[#e4dcd3] text-[#122b4a] hover:bg-[#fcfaf8]"
          }`}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className={`flex shrink-0 gap-2 ${align === "right" ? "justify-end" : ""}`}>
      <button
        type="button"
        onClick={() => handleEdit(job)}
        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
          dark
            ? "border-white/15 text-white hover:bg-white/10"
            : "border-[#e4dcd3] text-[#122b4a] hover:bg-[#fcfaf8]"
        }`}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => setPendingDeleteJobId(job.id)}
        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
          dark
            ? "border-[#8b3a33] text-[#ffd1cc] hover:bg-[#4a201d]"
            : "border-[#efcbc7] text-[#a2372f] hover:bg-[#fff3f1]"
        }`}
      >
        Delete
      </button>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  suggestions,
  min,
  step,
  dark = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number" | "date";
  required?: boolean;
  suggestions?: string[];
  min?: string;
  step?: string;
  dark?: boolean;
}) {
  const id = label.toLowerCase().replaceAll(" ", "-");
  const listId = suggestions?.length ? `${id}-suggestions` : undefined;

  return (
    <div>
      <label
        htmlFor={id}
        className={`mb-2 block text-sm font-semibold ${
          dark ? "text-[#c6d1c6]" : "text-[#11233b]"
        }`}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        list={listId}
        min={min}
        step={step}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-lg border px-3 py-3 text-sm outline-none transition ${
          dark
            ? "border-white/10 bg-white/5 text-white placeholder:text-[#879687] focus:border-[#d7e7cf] focus:ring-4 focus:ring-white/10"
            : "border-[#e4dcd3] bg-white text-[#11233b] placeholder:text-[#4f5e72]/70 focus:border-[#f96d10] focus:ring-4 focus:ring-[#f96d10]/20"
        }`}
      />
      {listId ? (
        <datalist id={listId}>
          {(suggestions ?? []).map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  required = false,
  dark = false,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  dark?: boolean;
  rows?: number;
}) {
  const id = label.toLowerCase().replaceAll(" ", "-");

  return (
    <div>
      <label
        htmlFor={id}
        className={`mb-2 block text-sm font-semibold ${
          dark ? "text-[#c6d1c6]" : "text-[#11233b]"
        }`}
      >
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        required={required}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full resize-y rounded-lg border px-3 py-3 text-sm leading-6 outline-none transition ${
          dark
            ? "border-white/10 bg-white/5 text-white placeholder:text-[#879687] focus:border-[#d7e7cf] focus:ring-4 focus:ring-white/10"
            : "border-[#e4dcd3] bg-white text-[#11233b] placeholder:text-[#4f5e72]/70 focus:border-[#f96d10] focus:ring-4 focus:ring-[#f96d10]/20"
        }`}
      />
    </div>
  );
}

function JobDetail({
  label,
  value,
  dark = false,
}: {
  label: string;
  value: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-md px-3 py-2 ${
        dark ? "bg-white/5" : "bg-[#fcfaf8]"
      }`}
    >
      <dt
        className={`truncate text-xs font-semibold uppercase tracking-[0.08em] ${
          dark ? "text-[#9fb39f]" : "text-[#387559]"
        }`}
      >
        {label}
      </dt>
      <dd
        className={`mt-1 whitespace-pre-wrap break-words text-sm leading-6 ${
          dark ? "text-[#c6d1c6]" : "text-[#4f5e72]"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function EmptyState({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <div
      className={`rounded-lg border border-dashed p-8 text-center ${
        tone === "dark"
          ? "border-white/15 bg-white/5 text-white"
          : "border-[#e4dcd3] bg-white text-[#11233b] shadow-sm"
      }`}
    >
      <h3 className="text-base font-semibold">No completed jobs found.</h3>
      <p
        className={
          tone === "dark"
            ? "mt-2 text-sm text-[#c6d1c6]"
            : "mt-2 text-sm text-[#4f5e72]"
        }
      >
        Add a completed job or adjust the search.
      </p>
    </div>
  );
}
