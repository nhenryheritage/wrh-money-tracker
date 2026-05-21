export type Job = {
  id: string;
  customerName: string;
  jobAddress: string;
  jobDescription: string;
  briefSummary: string;
  finalAmount: number;
  dateCompleted: string;
  optionalNotes: string;
  createdAt: string;
  updatedAt: string;
};

export type JobFormData = {
  customerName: string;
  jobAddress: string;
  jobDescription: string;
  briefSummary: string;
  finalAmount: string;
  dateCompleted: string;
  optionalNotes: string;
};

export type CustomerProfile = {
  key: string;
  customerName: string;
  latestAddress: string;
  jobCount: number;
  totalRevenue: number;
  latestDate: string;
  jobs: Job[];
};

export function normalizeAmount(value: string) {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
}

export function normalizeCustomerKey(customerName: string) {
  return customerName.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildCustomerProfiles(jobsToGroup: Job[]) {
  const profiles = new Map<string, CustomerProfile>();

  jobsToGroup.forEach((job) => {
    const key = normalizeCustomerKey(job.customerName);
    const existingProfile = profiles.get(key);

    if (!existingProfile) {
      profiles.set(key, {
        key,
        customerName: job.customerName,
        latestAddress: job.jobAddress,
        jobCount: 1,
        totalRevenue: job.finalAmount,
        latestDate: job.dateCompleted,
        jobs: [job],
      });
      return;
    }

    existingProfile.jobs.push(job);
    existingProfile.jobCount += 1;
    existingProfile.totalRevenue += job.finalAmount;

    if (job.dateCompleted.localeCompare(existingProfile.latestDate) > 0) {
      existingProfile.latestDate = job.dateCompleted;
      existingProfile.latestAddress = job.jobAddress;
    }
  });

  return Array.from(profiles.values())
    .map((profile) => ({
      ...profile,
      jobs: [...profile.jobs].sort((a, b) => {
        const dateCompare = b.dateCompleted.localeCompare(a.dateCompleted);
        return dateCompare || b.createdAt.localeCompare(a.createdAt);
      }),
    }))
    .sort((a, b) => {
      const dateCompare = b.latestDate.localeCompare(a.latestDate);
      return dateCompare || a.customerName.localeCompare(b.customerName);
    });
}
