export type WorkstationGmpProfile = {
  qualificationStatus: "QUALIFIED" | "DUE" | "EXPIRED";
  calibrationDueDate: Date | null;
  cleanStatus: "CLEAN" | "DIRTY";
  cleanHoldExpiresAt: Date | null;
};

/** Default major clean when station is dirty or clean-hold expired (minutes). */
export const DEFAULT_MAJOR_CLEAN_MINUTES = 120;

export function isCalibrationValid(profile: WorkstationGmpProfile, at: Date): boolean {
  if (!profile.calibrationDueDate) return true;
  const due = profile.calibrationDueDate;
  const dueEnd = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate(), 23, 59, 59));
  return at.getTime() <= dueEnd.getTime();
}

export function gmpCleanMinutesBeforeJob(profile: WorkstationGmpProfile, at: Date): number {
  if (profile.qualificationStatus === "EXPIRED") return Number.POSITIVE_INFINITY;
  if (!isCalibrationValid(profile, at)) return Number.POSITIVE_INFINITY;

  const holdExpired =
    profile.cleanHoldExpiresAt != null && profile.cleanHoldExpiresAt.getTime() < at.getTime();
  if (profile.cleanStatus === "DIRTY" || holdExpired) {
    return DEFAULT_MAJOR_CLEAN_MINUTES;
  }
  return 0;
}

export function canScheduleOnWorkstation(profile: WorkstationGmpProfile, at: Date): boolean {
  if (profile.qualificationStatus === "EXPIRED") return false;
  if (!isCalibrationValid(profile, at)) return false;
  const cleanMinutes = gmpCleanMinutesBeforeJob(profile, at);
  return Number.isFinite(cleanMinutes);
}
