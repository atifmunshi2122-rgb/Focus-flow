export interface GoogleCalendarConnectionStatus {
  connected: boolean;
  calendarId: string;
  calendarName?: string;
  autoSyncTasks: boolean;
  autoSyncTimeBlocks: boolean;
  autoSyncStudySchedule: boolean;
  lastSyncAt: string | null;
  revoked?: boolean;
}

export interface GoogleCalendarEntry {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  status?: string;
  htmlLink?: string;
  managePolicy: 'focusflow_managed' | 'external_readonly';
  sourceType?: 'task' | 'timeblock' | 'study_plan' | 'external';
  sourceId?: string;
}

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary: boolean;
  timeZone?: string;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  updated: number;
  removed: number;
  error?: string;
}

