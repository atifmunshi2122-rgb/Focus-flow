var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/lib/dateTime.ts
function getZonedFormatter(timezone) {
  let formatter = zonedFormatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
      weekday: "short"
    });
    if (zonedFormatterCache.size > 50) {
      zonedFormatterCache.clear();
    }
    zonedFormatterCache.set(timezone, formatter);
  }
  return formatter;
}
function getZonedDateParts(input = /* @__PURE__ */ new Date(), timezone = DEFAULT_TIMEZONE) {
  const date = typeof input === "string" || typeof input === "number" ? new Date(input) : input;
  const safeDate = Number.isNaN(date.getTime()) ? /* @__PURE__ */ new Date() : date;
  try {
    const formatter = getZonedFormatter(timezone);
    const parts = formatter.formatToParts(safeDate);
    const map = {};
    for (const p of parts) {
      map[p.type] = p.value;
    }
    const dayName = map.weekday || "";
    const dayMap = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6
    };
    let hour = parseInt(map.hour || "0", 10);
    if (hour === 24) hour = 0;
    return {
      year: parseInt(map.year || "2026", 10),
      month: parseInt(map.month || "1", 10),
      day: parseInt(map.day || "1", 10),
      hour,
      minute: parseInt(map.minute || "0", 10),
      second: parseInt(map.second || "0", 10),
      dayOfWeek: dayMap[dayName] !== void 0 ? dayMap[dayName] : safeDate.getDay()
    };
  } catch {
    return {
      year: safeDate.getFullYear(),
      month: safeDate.getMonth() + 1,
      day: safeDate.getDate(),
      hour: safeDate.getHours(),
      minute: safeDate.getMinutes(),
      second: safeDate.getSeconds(),
      dayOfWeek: safeDate.getDay()
    };
  }
}
function getTodayDateString(timezone = DEFAULT_TIMEZONE) {
  const parts = getZonedDateParts(/* @__PURE__ */ new Date(), timezone);
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${parts.year}-${m}-${d}`;
}
function formatDateInTimezone(input, timezone = DEFAULT_TIMEZONE) {
  const parts = getZonedDateParts(input, timezone);
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${parts.year}-${m}-${d}`;
}
function isLeapYear(year) {
  return year % 4 === 0 && year % 100 !== 0 || year % 400 === 0;
}
function getDaysInMonth(year, month) {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month)) {
    return 30;
  }
  return 31;
}
function parseDateString(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split("-").map((v) => parseInt(v, 10));
  if (m < 1 || m > 12) return null;
  const maxDays = getDaysInMonth(y, m);
  if (d < 1 || d > maxDays) return null;
  return { year: y, month: m, day: d };
}
function formatYmd(year, month, day) {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}
function getStartOfWeek(input = /* @__PURE__ */ new Date(), timezone = DEFAULT_TIMEZONE) {
  const parts = getZonedDateParts(input, timezone);
  const day = parts.dayOfWeek;
  const diffToMonday = (day + 6) % 7;
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  base.setUTCDate(base.getUTCDate() - diffToMonday);
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, "0");
  const d = String(base.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function getEndOfWeek(input = /* @__PURE__ */ new Date(), timezone = DEFAULT_TIMEZONE) {
  const startStr = getStartOfWeek(input, timezone);
  const parsed = parseDateString(startStr);
  if (!parsed) return startStr;
  const base = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  base.setUTCDate(base.getUTCDate() + 6);
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, "0");
  const d = String(base.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function getStartOfMonth(input = /* @__PURE__ */ new Date(), timezone = DEFAULT_TIMEZONE) {
  const parts = getZonedDateParts(input, timezone);
  return formatYmd(parts.year, parts.month, 1);
}
function getEndOfMonth(input = /* @__PURE__ */ new Date(), timezone = DEFAULT_TIMEZONE) {
  const parts = getZonedDateParts(input, timezone);
  const lastDay = getDaysInMonth(parts.year, parts.month);
  return formatYmd(parts.year, parts.month, lastDay);
}
function addDays(dateStr, days) {
  const parsed = parseDateString(dateStr);
  if (!parsed) return dateStr;
  const d = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  d.setUTCDate(d.getUTCDate() + days);
  return formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
function calculateFocusStreakDays(sessions, timezone = DEFAULT_TIMEZONE, referenceDate = /* @__PURE__ */ new Date()) {
  const completedDays = /* @__PURE__ */ new Set();
  for (const s of sessions) {
    if (!s || !s.completed || s.mode !== "work") continue;
    if (typeof s.startedAt !== "string") continue;
    try {
      const zonedDateStr = formatDateInTimezone(s.startedAt, timezone);
      if (parseDateString(zonedDateStr)) {
        completedDays.add(zonedDateStr);
      }
    } catch {
    }
  }
  if (completedDays.size === 0) return 0;
  const todayStr = formatDateInTimezone(referenceDate, timezone);
  const yesterdayStr = addDays(todayStr, -1);
  let startOffset = -1;
  if (completedDays.has(todayStr)) {
    startOffset = 0;
  } else if (completedDays.has(yesterdayStr)) {
    startOffset = 1;
  } else {
    return 0;
  }
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const checkDate = addDays(todayStr, -(startOffset + i));
    if (completedDays.has(checkDate)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
function computeBestStreakDays(sessions, timezone = DEFAULT_TIMEZONE) {
  const uniqueDates = /* @__PURE__ */ new Set();
  for (const s of sessions) {
    if (!s || !s.completed || s.mode !== "work") continue;
    if (typeof s.startedAt !== "string") continue;
    try {
      const zonedDateStr = formatDateInTimezone(s.startedAt, timezone);
      if (parseDateString(zonedDateStr)) {
        uniqueDates.add(zonedDateStr);
      }
    } catch {
    }
  }
  if (uniqueDates.size === 0) return 0;
  const sorted = Array.from(uniqueDates).sort();
  let best = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const expected = addDays(prev, 1);
    if (sorted[i] === expected) {
      current++;
      if (current > best) best = current;
    } else {
      current = 1;
    }
  }
  return best;
}
var DEFAULT_TIMEZONE, zonedFormatterCache;
var init_dateTime = __esm({
  "src/lib/dateTime.ts"() {
    DEFAULT_TIMEZONE = "Asia/Kolkata";
    zonedFormatterCache = /* @__PURE__ */ new Map();
  }
});

// server/dateTime.ts
var init_dateTime2 = __esm({
  "server/dateTime.ts"() {
    init_dateTime();
  }
});

// src/lib/vaultIntelligence.ts
function isValidRatio(ratio, memberUids) {
  if (!ratio || typeof ratio !== "object") return false;
  const keys = Object.keys(ratio);
  if (keys.length !== 2) return false;
  for (const uid of memberUids) {
    if (typeof ratio[uid] !== "number" || !Number.isInteger(ratio[uid]) || ratio[uid] < 0 || ratio[uid] > 100) {
      return false;
    }
  }
  const sum = keys.reduce((acc, k) => acc + (ratio[k] || 0), 0);
  return sum === 100;
}
function allocateTargetPaise(totalTargetPaise, ratioA, uidA, uidB) {
  const shareA = Math.floor(totalTargetPaise * ratioA / 100);
  const shareB = totalTargetPaise - shareA;
  return {
    [uidA]: shareA,
    [uidB]: shareB
  };
}
function computeMemberContributionStats(vault, members, contributions) {
  const stats = {};
  const activeContributions = contributions.filter((c) => c.status === "active");
  const uidA = vault.memberUids[0] || "";
  const uidB = vault.memberUids[1] || "";
  const ratioA = vault.targetRatio[uidA] ?? 50;
  const targets = uidA && uidB ? allocateTargetPaise(vault.targetPaise, ratioA, uidA, uidB) : { [uidA]: vault.targetPaise };
  for (const member of members) {
    const memberContribs = activeContributions.filter((c) => c.contributedByUid === member.uid);
    const totalPaise = memberContribs.reduce((acc, c) => acc + c.amountPaise, 0);
    const targetSharePaise = targets[member.uid] || Math.floor(vault.targetPaise / Math.max(1, members.length));
    const targetRatioPercent = vault.targetRatio[member.uid] ?? 50;
    const progressPercent = targetSharePaise > 0 ? Math.min(100, Math.round(totalPaise / targetSharePaise * 100)) : 100;
    stats[member.uid] = {
      uid: member.uid,
      name: member.name,
      totalPaise,
      count: memberContribs.length,
      targetSharePaise,
      targetRatioPercent,
      progressPercent
    };
  }
  return stats;
}
function computeVaultSettlement(members, expenses, settlements) {
  if (members.length < 2) return null;
  const memberA = members[0];
  const memberB = members[1];
  const activeExpenses = expenses.filter((e) => e.status === "active");
  let paidByA = 0;
  let paidByB = 0;
  let shareOfA = 0;
  let shareOfB = 0;
  for (const exp of activeExpenses) {
    if (exp.paidByUid === memberA.uid) {
      paidByA += exp.amountPaise;
    } else if (exp.paidByUid === memberB.uid) {
      paidByB += exp.amountPaise;
    }
    shareOfA += exp.memberShares[memberA.uid] || 0;
    shareOfB += exp.memberShares[memberB.uid] || 0;
  }
  let settledByAtoB = 0;
  let settledByBtoA = 0;
  for (const s of settlements) {
    if (s.fromUid === memberA.uid && s.toUid === memberB.uid) {
      settledByAtoB += s.amountPaise;
    } else if (s.fromUid === memberB.uid && s.toUid === memberA.uid) {
      settledByBtoA += s.amountPaise;
    }
  }
  const netBalancePaise = paidByA - shareOfA - (settledByBtoA - settledByAtoB);
  let debtorUid = null;
  let debtorName = null;
  let creditorUid = null;
  let creditorName = null;
  if (netBalancePaise > 0) {
    debtorUid = memberB.uid;
    debtorName = memberB.name;
    creditorUid = memberA.uid;
    creditorName = memberA.name;
  } else if (netBalancePaise < 0) {
    debtorUid = memberA.uid;
    debtorName = memberA.name;
    creditorUid = memberB.uid;
    creditorName = memberB.name;
  }
  return {
    memberA: { uid: memberA.uid, name: memberA.name },
    memberB: { uid: memberB.uid, name: memberB.name },
    totalExpensesPaise: paidByA + paidByB,
    paidByA,
    paidByB,
    shareOfA,
    shareOfB,
    settledByAtoB,
    settledByBtoA,
    netBalancePaise,
    debtorUid,
    debtorName,
    creditorUid,
    creditorName,
    settled: netBalancePaise === 0
  };
}
function splitExpense(amountPaise, splitMode, uidA, uidB, ratioA = 50, customShares) {
  if (splitMode === "equal") {
    const shareA = Math.floor(amountPaise / 2);
    const shareB = amountPaise - shareA;
    return { [uidA]: shareA, [uidB]: shareB };
  }
  if (splitMode === "ratio") {
    const shareA = Math.floor(amountPaise * ratioA / 100);
    const shareB = amountPaise - shareA;
    return { [uidA]: shareA, [uidB]: shareB };
  }
  if (customShares) {
    const shareA = customShares[uidA] || 0;
    const shareB = customShares[uidB] || 0;
    if (shareA + shareB === amountPaise && shareA >= 0 && shareB >= 0) {
      return { [uidA]: shareA, [uidB]: shareB };
    }
  }
  const fallbackA = Math.floor(amountPaise / 2);
  return { [uidA]: fallbackA, [uidB]: amountPaise - fallbackA };
}
function computeMilestones(targetPaise, totalContributedPaise, activities = []) {
  const percentages = [25, 50, 75, 100];
  return percentages.map((percent) => {
    const milestoneTarget = Math.floor(targetPaise * percent / 100);
    const achieved = targetPaise > 0 && totalContributedPaise >= milestoneTarget;
    const activity = activities.find(
      (a) => a.type === "milestone_achieved" && a.metadata?.percent === percent
    );
    return {
      percent,
      targetPaise: milestoneTarget,
      achieved,
      achievedAt: activity?.timestamp
    };
  });
}
function buildVaultSummary(vault, members, contributions, expenses = [], settlements = [], activities = []) {
  const activeContributions = contributions.filter((c) => c.status === "active");
  const totalContributedPaise = activeContributions.reduce((acc, c) => acc + c.amountPaise, 0);
  const remainingTargetPaise = Math.max(0, vault.targetPaise - totalContributedPaise);
  const progressPercentage = vault.targetPaise > 0 ? Math.min(100, Math.round(totalContributedPaise / vault.targetPaise * 100)) : 100;
  const memberStats = computeMemberContributionStats(vault, members, contributions);
  const settlement = computeVaultSettlement(members, expenses, settlements);
  const milestones = computeMilestones(vault.targetPaise, totalContributedPaise, activities);
  const recentActivity = [...activities].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 20);
  return {
    vault,
    members,
    totalContributedPaise,
    remainingTargetPaise,
    progressPercentage,
    memberStats,
    settlement,
    milestones,
    recentActivity
  };
}
var init_vaultIntelligence = __esm({
  "src/lib/vaultIntelligence.ts"() {
  }
});

// src/lib/currency.ts
function formatCurrency(amountPaise, currency = "INR", options) {
  const symbol = CURRENCY_SYMBOLS[currency] || "\u20B9";
  const safePaise = typeof amountPaise === "number" && Number.isFinite(amountPaise) ? amountPaise : 0;
  const isNegative = safePaise < 0;
  const absPaise = Math.abs(safePaise);
  const units = absPaise / 100;
  if (options?.compact && units >= 1e3) {
    let compactFormatted;
    if (units >= 1e7) {
      compactFormatted = `${(units / 1e7).toFixed(2)}Cr`;
    } else if (units >= 1e5) {
      compactFormatted = `${(units / 1e5).toFixed(1)}L`;
    } else {
      compactFormatted = `${(units / 1e3).toFixed(1)}K`;
    }
    return `${isNegative ? "-" : ""}${symbol}${compactFormatted}`;
  }
  const formatted = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    minimumFractionDigits: options?.hideDecimals ? 0 : 2,
    maximumFractionDigits: options?.hideDecimals ? 0 : 2
  }).format(units);
  return `${isNegative ? "-" : ""}${symbol}${formatted}`;
}
var CURRENCY_SYMBOLS;
var init_currency = __esm({
  "src/lib/currency.ts"() {
    CURRENCY_SYMBOLS = {
      INR: "\u20B9",
      USD: "$",
      EUR: "\u20AC",
      GBP: "\xA3"
    };
  }
});

// server/db.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
function isVercelRuntime() {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}
function resolveDefaultDataDir() {
  if (process.env.DATA_DIR) {
    return path.resolve(process.env.DATA_DIR);
  }
  if (isVercelRuntime()) {
    return path.join(os.tmpdir(), "focusflow-data");
  }
  return path.resolve(process.cwd(), "data");
}
var DATA_DIR, DB_FILE, DEFAULT_CATEGORIES, DatabaseCorruptError, PersistenceDegradedError, DatabaseService, dbService;
var init_db = __esm({
  "server/db.ts"() {
    init_dateTime2();
    init_vaultIntelligence();
    init_currency();
    DATA_DIR = resolveDefaultDataDir();
    DB_FILE = path.resolve(DATA_DIR, "database.json");
    DEFAULT_CATEGORIES = [
      { name: "Housing & Rent", type: "fixed", icon: "Home", color: "#6366f1" },
      { name: "Internet & Utilities", type: "fixed", icon: "Wifi", color: "#0ea5e9" },
      { name: "Subscriptions", type: "fixed", icon: "Tv", color: "#8b5cf6" },
      { name: "Insurance & Healthcare", type: "fixed", icon: "Shield", color: "#ec4899" },
      { name: "Education & Fees", type: "fixed", icon: "GraduationCap", color: "#f59e0b" },
      { name: "Food & Dining", type: "variable", icon: "Utensils", color: "#10b981" },
      { name: "Groceries", type: "variable", icon: "ShoppingBag", color: "#14b8a6" },
      { name: "Transportation & Fuel", type: "variable", icon: "Car", color: "#f97316" },
      { name: "Shopping & Retail", type: "variable", icon: "ShoppingBag", color: "#a855f7" },
      { name: "Entertainment & Leisure", type: "variable", icon: "Film", color: "#06b6d4" },
      { name: "Personal & Wellness", type: "variable", icon: "Heart", color: "#e11d48" },
      { name: "Emergency & Miscellaneous", type: "variable", icon: "AlertCircle", color: "#64748b" }
    ];
    DatabaseCorruptError = class extends Error {
      constructor(message, dbPath, cause) {
        super(message);
        this.name = "DatabaseCorruptError";
        this.dbPath = dbPath;
        if (cause) {
          this.cause = cause;
        }
      }
    };
    PersistenceDegradedError = class extends Error {
      constructor(message, dbPath, cause) {
        super(message);
        this.name = "PersistenceDegradedError";
        this.dbPath = dbPath;
        if (cause) {
          this.cause = cause;
        }
      }
    };
    DatabaseService = class {
      constructor(customDataDir) {
        this.db = {
          users: [],
          userSettings: [],
          tasks: [],
          focusSessions: [],
          categories: [],
          recurringExpenses: [],
          bills: [],
          paymentHistory: [],
          incomeTransactions: [],
          expenseTransactions: [],
          savingsGoals: [],
          timeBlocks: [],
          envelopes: [],
          subscriptions: [],
          auditLogs: [],
          syncQueue: [],
          studySubjects: [],
          studyTopics: [],
          studyRevisions: [],
          studyMistakes: [],
          jointVaults: [],
          vaultMembers: [],
          vaultInvitations: [],
          vaultContributions: [],
          vaultExpenses: [],
          vaultSettlements: [],
          vaultActivities: [],
          skillNodes: [],
          whiteboardDrawings: [],
          examSimulations: [],
          decisionEntries: [],
          doomscrollLogs: [],
          lifeMilestones: [],
          timeCapsules: [],
          emergencyAssetProfiles: []
        };
        this.writeQueue = Promise.resolve();
        this.pendingWrites = [];
        this.tempCounter = 0;
        this.isCorrupted = false;
        this.corruptionError = null;
        this.isPersistenceDegraded = false;
        this.persistenceError = null;
        this.quarantinedRecords = [];
        const isVercel = isVercelRuntime();
        if (customDataDir) {
          this.dataDir = path.resolve(customDataDir);
        } else if (process.env.DATA_DIR) {
          this.dataDir = path.resolve(process.env.DATA_DIR);
        } else if (isVercel) {
          this.dataDir = path.join(os.tmpdir(), "focusflow-data");
        } else {
          this.dataDir = path.resolve(process.cwd(), "data");
        }
        this.dbFile = path.resolve(this.dataDir, "database.json");
        if (isVercel && !customDataDir) {
          console.log(
            `[DB] Vercel serverless environment detected. Local JSON store fallback configured at ${this.dataDir}. Note: /tmp is ephemeral; signed-in users persist authoritatively in Cloud Firestore.`
          );
        } else if (process.env.NODE_ENV === "production" && !process.env.DATA_DIR && !customDataDir) {
          console.warn(
            "[DB] Warning: DATA_DIR is not set in production; using local ./data/database.json fallback (ephemeral on container restarts unless a volume is mounted). Signed-in users persist directly in Cloud Firestore."
          );
        }
        const dirReady = this.ensureDataDir();
        if (dirReady) {
          this.load();
        }
        this.ensureBaseDefaults();
        if (process.env.SEED_DEFAULT_DATA === "true" && process.env.NODE_ENV !== "production" && !isVercel) {
          this.ensureSeedData();
        }
        this.checkRecurringBills();
      }
      getQuarantinedRecords() {
        return [...this.quarantinedRecords];
      }
      sanitizeAndQuarantineRecords(items, colName) {
        if (!Array.isArray(items)) return [];
        const valid = [];
        for (const item of items) {
          if (item && typeof item === "object") {
            const u = item.userId;
            if (typeof u === "string" && u.trim() !== "") {
              valid.push(item);
            } else {
              this.quarantinedRecords.push({
                collection: colName,
                recordId: item.id || "unknown",
                reason: "Legacy unowned record: missing or empty userId",
                data: item,
                quarantinedAt: (/* @__PURE__ */ new Date()).toISOString()
              });
            }
          }
        }
        return valid;
      }
      getDataDir() {
        return this.dataDir;
      }
      getDatabaseFile() {
        return this.dbFile;
      }
      ensureDataDir() {
        try {
          if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
          } else {
            try {
              const files = fs.readdirSync(this.dataDir);
              for (const f of files) {
                if (f.startsWith(".database.") && f.endsWith(".tmp")) {
                  try {
                    fs.unlinkSync(path.resolve(this.dataDir, f));
                  } catch {
                  }
                }
              }
            } catch {
            }
          }
          return true;
        } catch (err) {
          this.isPersistenceDegraded = true;
          this.persistenceError = err instanceof Error ? err : new Error(String(err));
          console.warn(
            `[DB] Warning: Failed to initialize data directory at ${this.dataDir} (${this.persistenceError.message}). Operating in degraded in-memory mode.`
          );
          return false;
        }
      }
      load() {
        try {
          if (!fs.existsSync(this.dbFile)) {
            return;
          }
        } catch (err) {
          this.isPersistenceDegraded = true;
          this.persistenceError = err instanceof Error ? err : new Error(String(err));
          console.warn(`[DB] Warning: Could not check database file existence at ${this.dbFile}: ${this.persistenceError.message}`);
          return;
        }
        let raw;
        try {
          raw = fs.readFileSync(this.dbFile, "utf-8");
        } catch (err) {
          this.isPersistenceDegraded = true;
          this.persistenceError = err instanceof Error ? err : new Error(String(err));
          console.warn(`[DB] Warning: Failed to read database file at ${this.dbFile}: ${this.persistenceError.message}`);
          return;
        }
        if (raw.trim().length === 0) {
          this.isCorrupted = true;
          this.corruptionError = new DatabaseCorruptError(
            `Database file at ${this.dbFile} is empty/truncated and cannot be parsed as JSON.`,
            this.dbFile
          );
          throw this.corruptionError;
        }
        try {
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("Database JSON root must be an object");
          }
          this.db = {
            users: Array.isArray(parsed.users) ? parsed.users : [],
            userSettings: Array.isArray(parsed.userSettings) ? parsed.userSettings : [],
            tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
            focusSessions: Array.isArray(parsed.focusSessions) ? parsed.focusSessions : [],
            categories: Array.isArray(parsed.categories) ? parsed.categories : [],
            recurringExpenses: Array.isArray(parsed.recurringExpenses) ? parsed.recurringExpenses : [],
            bills: Array.isArray(parsed.bills) ? parsed.bills : [],
            paymentHistory: Array.isArray(parsed.paymentHistory) ? parsed.paymentHistory : [],
            incomeTransactions: Array.isArray(parsed.incomeTransactions) ? parsed.incomeTransactions : [],
            expenseTransactions: Array.isArray(parsed.expenseTransactions) ? parsed.expenseTransactions : [],
            savingsGoals: Array.isArray(parsed.savingsGoals) ? parsed.savingsGoals : [],
            timeBlocks: Array.isArray(parsed.timeBlocks) ? parsed.timeBlocks : [],
            envelopes: Array.isArray(parsed.envelopes) ? parsed.envelopes : [],
            subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
            auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
            syncQueue: Array.isArray(parsed.syncQueue) ? parsed.syncQueue : [],
            studyTiers: Array.isArray(parsed.studyTiers) ? parsed.studyTiers : [],
            studySubjects: Array.isArray(parsed.studySubjects) ? parsed.studySubjects : [],
            studyTopics: Array.isArray(parsed.studyTopics) ? parsed.studyTopics : [],
            studyRevisions: Array.isArray(parsed.studyRevisions) ? parsed.studyRevisions : [],
            studyMistakes: Array.isArray(parsed.studyMistakes) ? parsed.studyMistakes : [],
            jointVaults: Array.isArray(parsed.jointVaults) ? parsed.jointVaults : [],
            vaultMembers: Array.isArray(parsed.vaultMembers) ? parsed.vaultMembers : [],
            vaultInvitations: Array.isArray(parsed.vaultInvitations) ? parsed.vaultInvitations : [],
            vaultContributions: Array.isArray(parsed.vaultContributions) ? parsed.vaultContributions : [],
            vaultExpenses: Array.isArray(parsed.vaultExpenses) ? parsed.vaultExpenses : [],
            vaultSettlements: Array.isArray(parsed.vaultSettlements) ? parsed.vaultSettlements : [],
            vaultActivities: Array.isArray(parsed.vaultActivities) ? parsed.vaultActivities : [],
            skillNodes: this.sanitizeAndQuarantineRecords(parsed.skillNodes, "skillNodes"),
            whiteboardDrawings: this.sanitizeAndQuarantineRecords(parsed.whiteboardDrawings, "whiteboardDrawings"),
            examSimulations: this.sanitizeAndQuarantineRecords(parsed.examSimulations, "examSimulations"),
            decisionEntries: this.sanitizeAndQuarantineRecords(parsed.decisionEntries, "decisionEntries"),
            doomscrollLogs: this.sanitizeAndQuarantineRecords(parsed.doomscrollLogs, "doomscrollLogs"),
            lifeMilestones: this.sanitizeAndQuarantineRecords(parsed.lifeMilestones, "lifeMilestones"),
            timeCapsules: this.sanitizeAndQuarantineRecords(parsed.timeCapsules, "timeCapsules"),
            emergencyAssetProfiles: this.sanitizeAndQuarantineRecords(parsed.emergencyAssetProfiles, "emergencyAssetProfiles")
          };
        } catch (err) {
          this.isCorrupted = true;
          const causeMsg = err instanceof Error ? err.message : String(err);
          this.corruptionError = new DatabaseCorruptError(
            `Database file at ${this.dbFile} is corrupted and cannot be parsed: ${causeMsg}`,
            this.dbFile,
            err
          );
          throw this.corruptionError;
        }
      }
      isHealthy() {
        return !this.isCorrupted && !this.isPersistenceDegraded;
      }
      isDegraded() {
        return this.isPersistenceDegraded;
      }
      getCorruptionError() {
        return this.corruptionError;
      }
      getPersistenceError() {
        return this.persistenceError;
      }
      getDatabasePath() {
        return this.dbFile;
      }
      resetPersistenceHealth() {
        this.isPersistenceDegraded = false;
        this.persistenceError = null;
      }
      async recoverPersistence() {
        this.resetPersistenceHealth();
        await this.save();
      }
      save() {
        if (this.isCorrupted) {
          const err = new DatabaseCorruptError(
            `Database at ${this.dbFile} is corrupted. Refusing write operation to protect original data.`,
            this.dbFile
          );
          const rejected = Promise.reject(err);
          rejected.catch(() => {
          });
          return rejected;
        }
        if (this.isPersistenceDegraded) {
          const err = new PersistenceDegradedError(
            `Database at ${this.dbFile} is in a degraded read-only state due to earlier write failure: ${this.persistenceError?.message || ""}`,
            this.dbFile,
            this.persistenceError
          );
          const rejected = Promise.reject(err);
          rejected.catch(() => {
          });
          return rejected;
        }
        const snapshot = JSON.stringify(this.db, null, 2);
        const currentWrite = async () => {
          if (this.isPersistenceDegraded) {
            throw new PersistenceDegradedError(
              `Database at ${this.dbFile} is in a degraded read-only state due to earlier write failure: ${this.persistenceError?.message || ""}`,
              this.dbFile,
              this.persistenceError
            );
          }
          const counter = ++this.tempCounter;
          const tempPath = path.resolve(
            this.dataDir,
            `.database.${process.pid}.${Date.now()}.${counter}.tmp`
          );
          try {
            await fs.promises.mkdir(this.dataDir, { recursive: true });
            await fs.promises.writeFile(tempPath, snapshot, {
              encoding: "utf-8",
              mode: 384
            });
            await fs.promises.rename(tempPath, this.dbFile);
          } catch (err) {
            this.isPersistenceDegraded = true;
            this.persistenceError = err instanceof Error ? err : new Error(String(err));
            try {
              if (fs.existsSync(tempPath)) {
                await fs.promises.unlink(tempPath);
              }
            } catch {
            }
            throw err;
          }
        };
        const previousQueue = this.writeQueue;
        let opResolve;
        let opReject;
        const writePromise = new Promise((resolve, reject) => {
          opResolve = resolve;
          opReject = reject;
        });
        this.pendingWrites.push(writePromise);
        const cleanup = () => {
          const idx = this.pendingWrites.indexOf(writePromise);
          if (idx >= 0) {
            this.pendingWrites.splice(idx, 1);
          }
        };
        writePromise.then(cleanup, () => {
          cleanup();
        });
        this.writeQueue = (async () => {
          try {
            await previousQueue;
          } catch {
          }
          try {
            await currentWrite();
            opResolve();
          } catch (err) {
            opReject(err);
          }
        })();
        writePromise.catch(() => {
        });
        return writePromise;
      }
      async flush() {
        while (this.pendingWrites.length > 0) {
          if (this.isPersistenceDegraded && this.persistenceError) {
            throw this.persistenceError;
          }
          const batch = [...this.pendingWrites];
          await Promise.all(batch);
        }
        if (this.isPersistenceDegraded && this.persistenceError) {
          throw this.persistenceError;
        }
      }
      getRaw() {
        if (this.isCorrupted) {
          throw new DatabaseCorruptError(
            `Database at ${this.dbFile} is corrupted. Refusing read operation to protect integrity.`,
            this.dbFile
          );
        }
        return this.db;
      }
      /**
       * Ensure a user or isolated guest session has its own settings & categories workspace.
       */
      ensureUserWorkspace(userId, profile) {
        let user = this.db.users.find((u) => u.id === userId);
        let mutated = false;
        if (!user) {
          user = {
            id: userId,
            email: profile?.email || (profile?.isGuest ? "guest@focusflow.local" : "user@focusflow.local"),
            name: profile?.name || (profile?.isGuest ? "Guest Workspace" : "Focus User"),
            avatarUrl: profile?.avatarUrl || "",
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          };
          this.db.users.push(user);
          mutated = true;
        } else if (profile && !profile.isGuest) {
          if (profile.email && user.email !== profile.email) {
            user.email = profile.email;
            mutated = true;
          }
          if (profile.name && user.name !== profile.name) {
            user.name = profile.name;
            mutated = true;
          }
          if (profile.avatarUrl !== void 0 && user.avatarUrl !== profile.avatarUrl) {
            user.avatarUrl = profile.avatarUrl;
            mutated = true;
          }
        }
        let settings = this.db.userSettings.find((s) => s.userId === userId);
        if (!settings) {
          settings = {
            userId,
            currency: "INR",
            pomodoroWorkDuration: 25,
            shortBreakDuration: 5,
            longBreakDuration: 15,
            autoSwitchSessions: false,
            soundEnabled: true,
            theme: "dark"
          };
          this.db.userSettings.push(settings);
          mutated = true;
        }
        const userHasCategories = this.db.categories.some((c) => c.userId === userId);
        if (!userHasCategories) {
          const userCats = DEFAULT_CATEGORIES.map((cat, idx) => ({
            id: userId === "usr_atif_default" ? `cat_${idx + 1}` : `cat_${userId}_${idx + 1}`,
            userId,
            ...cat
          }));
          this.db.categories.push(...userCats);
          mutated = true;
        }
        if (mutated) {
          this.save();
        }
        return { user, settings };
      }
      getUserSettings(userId) {
        return this.db.userSettings.find((s) => s.userId === userId);
      }
      getFallbackCategoryId(userId) {
        const userCat = this.db.categories.find((c) => c.userId === userId || c.userId === "system");
        if (userCat) return userCat.id;
        const { user } = this.ensureUserWorkspace(userId);
        const created = this.db.categories.find((c) => c.userId === user.id);
        return created ? created.id : "cat_1";
      }
      reseed(targetUserId) {
        if (!targetUserId || targetUserId === "usr_atif_default") {
          const preservedUsers = this.db.users.filter((u) => u.id !== "usr_atif_default");
          const preservedSettings = this.db.userSettings.filter((s) => s.userId !== "usr_atif_default");
          const preservedTasks = this.db.tasks.filter((t) => t.userId !== "usr_atif_default");
          const preservedSessions = this.db.focusSessions.filter((s) => s.userId !== "usr_atif_default");
          const preservedCats = this.db.categories.filter((c) => c.userId !== "usr_atif_default");
          const preservedRec = this.db.recurringExpenses.filter((r) => r.userId !== "usr_atif_default");
          const preservedBills = this.db.bills.filter((b) => b.userId !== "usr_atif_default");
          const preservedHistory = this.db.paymentHistory.filter((p) => p.userId !== "usr_atif_default");
          const preservedIncome = this.db.incomeTransactions.filter((i) => i.userId !== "usr_atif_default");
          const preservedExp = this.db.expenseTransactions.filter((e) => e.userId !== "usr_atif_default");
          const preservedGoals = this.db.savingsGoals.filter((g) => g.userId !== "usr_atif_default");
          const preservedTimeBlocks = (this.db.timeBlocks || []).filter((tb) => tb.userId !== "usr_atif_default");
          const preservedEnvelopes = (this.db.envelopes || []).filter((env) => env.userId !== "usr_atif_default");
          const preservedSubscriptions = (this.db.subscriptions || []).filter((sub) => sub.userId !== "usr_atif_default");
          const preservedAuditLogs = (this.db.auditLogs || []).filter((l) => l.userId !== "usr_atif_default");
          const preservedSyncQueue = (this.db.syncQueue || []).filter((sq) => sq.userId !== "usr_atif_default");
          const preservedStudyTiers = (this.db.studyTiers || []).filter((st) => st.userId && st.userId !== "usr_atif_default");
          this.db = {
            users: preservedUsers,
            userSettings: preservedSettings,
            tasks: preservedTasks,
            focusSessions: preservedSessions,
            categories: preservedCats,
            recurringExpenses: preservedRec,
            bills: preservedBills,
            paymentHistory: preservedHistory,
            incomeTransactions: preservedIncome,
            expenseTransactions: preservedExp,
            savingsGoals: preservedGoals,
            timeBlocks: preservedTimeBlocks,
            envelopes: preservedEnvelopes,
            subscriptions: preservedSubscriptions,
            auditLogs: preservedAuditLogs,
            syncQueue: preservedSyncQueue,
            studyTiers: preservedStudyTiers
          };
          this.ensureSeedDataForUser("usr_atif_default", true);
          this.checkRecurringBills("usr_atif_default");
          this.save();
          return;
        }
        this.db.tasks = this.db.tasks.filter((t) => t.userId !== targetUserId);
        this.db.focusSessions = this.db.focusSessions.filter((s) => s.userId !== targetUserId);
        this.db.categories = this.db.categories.filter((c) => c.userId !== targetUserId);
        this.db.recurringExpenses = this.db.recurringExpenses.filter((r) => r.userId !== targetUserId);
        this.db.bills = this.db.bills.filter((b) => b.userId !== targetUserId);
        this.db.paymentHistory = this.db.paymentHistory.filter((p) => p.userId !== targetUserId);
        this.db.incomeTransactions = this.db.incomeTransactions.filter((i) => i.userId !== targetUserId);
        this.db.expenseTransactions = this.db.expenseTransactions.filter((e) => e.userId !== targetUserId);
        this.db.savingsGoals = this.db.savingsGoals.filter((g) => g.userId !== targetUserId);
        this.db.timeBlocks = (this.db.timeBlocks || []).filter((tb) => tb.userId !== targetUserId);
        this.db.envelopes = (this.db.envelopes || []).filter((env) => env.userId !== targetUserId);
        this.db.subscriptions = (this.db.subscriptions || []).filter((sub) => sub.userId !== targetUserId);
        this.db.studySubjects = (this.db.studySubjects || []).filter((s) => s.userId !== targetUserId);
        this.db.studyTopics = (this.db.studyTopics || []).filter((t) => t.userId !== targetUserId);
        this.db.studyRevisions = (this.db.studyRevisions || []).filter((r) => r.userId !== targetUserId);
        this.db.studyMistakes = (this.db.studyMistakes || []).filter((m) => m.userId !== targetUserId);
        this.db.studyTiers = (this.db.studyTiers || []).filter((st) => st.userId !== targetUserId);
        this.db.auditLogs = (this.db.auditLogs || []).filter((l) => l.userId !== targetUserId);
        this.db.syncQueue = (this.db.syncQueue || []).filter((sq) => sq.userId !== targetUserId);
        this.ensureSeedDataForUser(targetUserId, false);
        this.checkRecurringBills(targetUserId);
        this.save();
      }
      clearWorkspace(targetUserId) {
        const isTarget = (id) => id === targetUserId;
        this.db.tasks = this.db.tasks.filter((t) => !isTarget(t.userId));
        this.db.focusSessions = this.db.focusSessions.filter((s) => !isTarget(s.userId));
        this.db.recurringExpenses = this.db.recurringExpenses.filter((r) => !isTarget(r.userId));
        this.db.bills = this.db.bills.filter((b) => !isTarget(b.userId));
        this.db.paymentHistory = this.db.paymentHistory.filter((p) => !isTarget(p.userId));
        this.db.incomeTransactions = this.db.incomeTransactions.filter((i) => !isTarget(i.userId));
        this.db.expenseTransactions = this.db.expenseTransactions.filter((e) => !isTarget(e.userId));
        this.db.savingsGoals = this.db.savingsGoals.filter((g) => !isTarget(g.userId));
        this.db.timeBlocks = (this.db.timeBlocks || []).filter((tb) => !isTarget(tb.userId));
        this.db.envelopes = (this.db.envelopes || []).filter((env) => !isTarget(env.userId));
        this.db.subscriptions = (this.db.subscriptions || []).filter((sub) => !isTarget(sub.userId));
        this.db.studySubjects = (this.db.studySubjects || []).filter((s) => !isTarget(s.userId));
        this.db.studyTopics = (this.db.studyTopics || []).filter((t) => !isTarget(t.userId));
        this.db.studyRevisions = (this.db.studyRevisions || []).filter((r) => !isTarget(r.userId));
        this.db.studyMistakes = (this.db.studyMistakes || []).filter((m) => !isTarget(m.userId));
        this.db.studyTiers = (this.db.studyTiers || []).filter((st) => st.userId !== targetUserId);
        this.save();
      }
      ensureBaseDefaults() {
        if (!this.db.categories || this.db.categories.length === 0) {
          this.db.categories = DEFAULT_CATEGORIES.map((cat, idx) => ({
            id: `cat_${idx + 1}`,
            userId: "usr_default",
            ...cat
          }));
          if (!this.isPersistenceDegraded) {
            this.save().catch((err) => {
              console.warn(`[DB] Notice: Could not persist base defaults to disk (${err?.message || err}). In-memory defaults active.`);
            });
          }
        }
      }
      ensureSeedData(force = false) {
        if (process.env.NODE_ENV === "production" || isVercelRuntime()) {
          console.log("[DB] Notice: Seeding default user data is skipped in production/Vercel environment.");
          return;
        }
        if (this.db.users.some((u) => u.id === "usr_atif_default") && !force) {
          return;
        }
        this.ensureSeedDataForUser("usr_atif_default", force);
      }
      ensureSeedDataForUser(defaultUserId, force = false) {
        if (!force && this.db.tasks.some((t) => t.userId === defaultUserId)) {
          return;
        }
        const now = /* @__PURE__ */ new Date();
        const currentYear = now.getFullYear();
        const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
        const todayStr = `${currentYear}-${currentMonth}-${String(now.getDate()).padStart(2, "0")}`;
        if (!this.db.users.some((u) => u.id === defaultUserId)) {
          const user = {
            id: defaultUserId,
            email: defaultUserId === "usr_atif_default" ? "atifmunshi2122@gmail.com" : "guest@focusflow.local",
            name: defaultUserId === "usr_atif_default" ? "Atif Munshi" : "Guest Workspace",
            avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
            createdAt: new Date(Date.now() - 60 * 24 * 3600 * 1e3).toISOString()
          };
          this.db.users.push(user);
        }
        if (!this.db.userSettings.some((s) => s.userId === defaultUserId)) {
          this.db.userSettings.push({
            userId: defaultUserId,
            currency: "INR",
            pomodoroWorkDuration: 25,
            shortBreakDuration: 5,
            longBreakDuration: 15,
            autoSwitchSessions: false,
            soundEnabled: true,
            theme: "dark"
          });
        }
        if (!this.db.categories.some((c) => c.userId === defaultUserId)) {
          const catPrefix = defaultUserId === "usr_atif_default" ? "cat" : `cat_${defaultUserId}`;
          this.db.categories.push(
            ...DEFAULT_CATEGORIES.map((cat, idx) => ({
              id: `${catPrefix}_${idx + 1}`,
              userId: defaultUserId,
              ...cat
            }))
          );
        }
        const idSuffix = defaultUserId === "usr_atif_default" ? "" : `_${defaultUserId}`;
        const getCatId = (name) => {
          const userCats = this.db.categories.filter((c) => c.userId === defaultUserId);
          const found = userCats.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));
          return found ? found.id : userCats[0]?.id || "cat_1";
        };
        const sampleTasks = [
          {
            id: `tsk_1${idSuffix}`,
            userId: defaultUserId,
            title: "Architect Personal Finance & Focus App",
            description: "Implement full-stack relational persistence, unified dashboard, and dual-theme UI",
            priority: "high",
            status: "in_progress",
            estimatedPomodoros: 4,
            completedPomodoros: 3,
            dueDate: todayStr,
            createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1e3).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `tsk_2${idSuffix}`,
            userId: defaultUserId,
            title: "Review Monthly Budget & Recurring Bills",
            description: "Verify quarterly subscriptions and update payment schedules",
            priority: "medium",
            status: "todo",
            estimatedPomodoros: 2,
            completedPomodoros: 0,
            dueDate: todayStr,
            createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1e3).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `tsk_3${idSuffix}`,
            userId: defaultUserId,
            title: "Refactor Core Database Transactions",
            description: "Audit foreign key integrity and payment undo workflows",
            priority: "high",
            status: "completed",
            estimatedPomodoros: 3,
            completedPomodoros: 3,
            dueDate: todayStr,
            createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1e3).toISOString(),
            updatedAt: new Date(Date.now() - 1 * 24 * 3600 * 1e3).toISOString()
          },
          {
            id: `tsk_4${idSuffix}`,
            userId: defaultUserId,
            title: "Deep Work: Read System Architecture Papers",
            description: "Study state synchronization patterns and local-first offline databases",
            priority: "low",
            status: "todo",
            estimatedPomodoros: 2,
            completedPomodoros: 1,
            dueDate: null,
            createdAt: new Date(Date.now() - 4 * 24 * 3600 * 1e3).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        ];
        this.db.tasks.push(...sampleTasks);
        const sessions = [];
        for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
          const sessionDate = new Date(Date.now() - dayOffset * 24 * 3600 * 1e3);
          const count = dayOffset === 0 ? 4 : Math.floor(Math.random() * 3) + 3;
          for (let s = 0; s < count; s++) {
            const start = new Date(sessionDate.getTime() + s * 45 * 60 * 1e3);
            const end = new Date(start.getTime() + 25 * 60 * 1e3);
            sessions.push({
              id: `foc_${dayOffset}_${s}${idSuffix}`,
              userId: defaultUserId,
              taskId: s % 2 === 0 ? `tsk_1${idSuffix}` : `tsk_3${idSuffix}`,
              taskTitle: s % 2 === 0 ? "Architect Personal Finance & Focus App" : "Refactor Core Database Transactions",
              mode: "work",
              durationMinutes: 25,
              durationSeconds: 1500,
              completed: true,
              startedAt: start.toISOString(),
              endedAt: end.toISOString()
            });
          }
        }
        this.db.focusSessions.push(...sessions);
        const recurring = [
          {
            id: `rec_1${idSuffix}`,
            userId: defaultUserId,
            name: "Apartment Rent",
            amountPaise: 25e5,
            // ₹25,000.00
            categoryId: getCatId("Housing"),
            recurrence: "monthly",
            dueDay: 5,
            isActive: true,
            notes: "Monthly apartment lease payment via net banking",
            createdAt: new Date(Date.now() - 90 * 24 * 3600 * 1e3).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `rec_2${idSuffix}`,
            userId: defaultUserId,
            name: "High-Speed Fiber Internet",
            amountPaise: 129900,
            // ₹1,299.00
            categoryId: getCatId("Internet"),
            recurrence: "monthly",
            dueDay: 10,
            isActive: true,
            notes: "300 Mbps unlimited optical fiber connection",
            createdAt: new Date(Date.now() - 90 * 24 * 3600 * 1e3).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `rec_3${idSuffix}`,
            userId: defaultUserId,
            name: "Premium Cloud Hosting & VPS",
            amountPaise: 24e4,
            // ₹2,400.00
            categoryId: getCatId("Subscriptions"),
            recurrence: "monthly",
            dueDay: 15,
            isActive: true,
            notes: "Dedicated dev environment and staging servers",
            createdAt: new Date(Date.now() - 60 * 24 * 3600 * 1e3).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `rec_4${idSuffix}`,
            userId: defaultUserId,
            name: "Gym & Fitness Membership",
            amountPaise: 35e4,
            // ₹3,500.00
            categoryId: getCatId("Personal"),
            recurrence: "monthly",
            dueDay: 20,
            isActive: true,
            notes: "Monthly strength & wellness club pass",
            createdAt: new Date(Date.now() - 45 * 24 * 3600 * 1e3).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `rec_5${idSuffix}`,
            userId: defaultUserId,
            name: "Health Insurance Premium",
            amountPaise: 45e4,
            // ₹4,500.00
            categoryId: getCatId("Insurance"),
            recurrence: "monthly",
            dueDay: 28,
            isActive: true,
            notes: "Comprehensive medical protection",
            createdAt: new Date(Date.now() - 90 * 24 * 3600 * 1e3).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        ];
        this.db.recurringExpenses.push(...recurring);
        const periodKey = `${currentYear}-${currentMonth}`;
        const bills = [
          {
            id: `bill_cur_1${idSuffix}`,
            userId: defaultUserId,
            recurringExpenseId: `rec_1${idSuffix}`,
            name: "Apartment Rent",
            amountPaise: 25e5,
            categoryId: getCatId("Housing"),
            dueDate: `${currentYear}-${currentMonth}-05`,
            status: "PAID",
            paymentDate: `${currentYear}-${currentMonth}-04`,
            notes: "Paid via direct bank transfer",
            periodKey,
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `bill_cur_2${idSuffix}`,
            userId: defaultUserId,
            recurringExpenseId: `rec_2${idSuffix}`,
            name: "High-Speed Fiber Internet",
            amountPaise: 129900,
            categoryId: getCatId("Internet"),
            dueDate: `${currentYear}-${currentMonth}-10`,
            status: "PAID",
            paymentDate: `${currentYear}-${currentMonth}-09`,
            notes: "Auto-debit confirmed",
            periodKey,
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `bill_cur_3${idSuffix}`,
            userId: defaultUserId,
            recurringExpenseId: `rec_3${idSuffix}`,
            name: "Premium Cloud Hosting & VPS",
            amountPaise: 24e4,
            categoryId: getCatId("Subscriptions"),
            dueDate: `${currentYear}-${currentMonth}-15`,
            status: "UNPAID",
            paymentDate: null,
            notes: "Invoice received, due mid month",
            periodKey,
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `bill_cur_4${idSuffix}`,
            userId: defaultUserId,
            recurringExpenseId: `rec_4${idSuffix}`,
            name: "Gym & Fitness Membership",
            amountPaise: 35e4,
            categoryId: getCatId("Personal"),
            dueDate: `${currentYear}-${currentMonth}-20`,
            status: "UNPAID",
            paymentDate: null,
            notes: "Reminder set on calendar",
            periodKey,
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `bill_cur_5${idSuffix}`,
            userId: defaultUserId,
            recurringExpenseId: `rec_5${idSuffix}`,
            name: "Health Insurance Premium",
            amountPaise: 45e4,
            categoryId: getCatId("Insurance"),
            dueDate: `${currentYear}-${currentMonth}-28`,
            status: "UNPAID",
            paymentDate: null,
            notes: "Annual policy renewal installment",
            periodKey,
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        ];
        this.db.bills.push(...bills);
        this.db.paymentHistory.push(
          {
            id: `pay_hist_1${idSuffix}`,
            userId: defaultUserId,
            billId: `bill_cur_1${idSuffix}`,
            billName: "Apartment Rent",
            amountPaise: 25e5,
            paidDate: `${currentYear}-${currentMonth}-04`,
            paymentMethod: "upi_bank",
            transactionRef: "UPI-RENT-849201",
            notes: "Paid to landlord account",
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `pay_hist_2${idSuffix}`,
            userId: defaultUserId,
            billId: `bill_cur_2${idSuffix}`,
            billName: "High-Speed Fiber Internet",
            amountPaise: 129900,
            paidDate: `${currentYear}-${currentMonth}-09`,
            paymentMethod: "credit_card",
            transactionRef: "CC-NET-29831",
            notes: "Monthly auto-bill settled",
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        );
        this.db.incomeTransactions.push(
          {
            id: `inc_1${idSuffix}`,
            userId: defaultUserId,
            source: "Engineering Salary",
            amountPaise: 145e5,
            // ₹145,000.00
            date: `${currentYear}-${currentMonth}-01`,
            category: "Salary",
            notes: "Direct salary deposit for current month",
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `inc_2${idSuffix}`,
            userId: defaultUserId,
            source: "Full-Stack Consulting Project",
            amountPaise: 4e6,
            // ₹40,000.00
            date: `${currentYear}-${currentMonth}-06`,
            category: "Freelance",
            notes: "Milestone 2 deliverable payment",
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `inc_3${idSuffix}`,
            userId: defaultUserId,
            source: "Mutual Fund Dividend",
            amountPaise: 45e4,
            // ₹4,500.00
            date: `${currentYear}-${currentMonth}-08`,
            category: "Investments",
            notes: "Quarterly reinvested dividend",
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        );
        this.db.expenseTransactions.push(
          // Paid fixed bills logged as expenses
          {
            id: `exp_fix_1${idSuffix}`,
            userId: defaultUserId,
            billId: `bill_cur_1${idSuffix}`,
            type: "fixed",
            categoryId: getCatId("Housing"),
            amountPaise: 25e5,
            date: `${currentYear}-${currentMonth}-04`,
            description: "Apartment Rent (Bill payment)",
            paymentMethod: "upi_bank",
            notes: "Auto-recorded upon bill clearance",
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `exp_fix_2${idSuffix}`,
            userId: defaultUserId,
            billId: `bill_cur_2${idSuffix}`,
            type: "fixed",
            categoryId: getCatId("Internet"),
            amountPaise: 129900,
            date: `${currentYear}-${currentMonth}-09`,
            description: "High-Speed Fiber Internet (Bill payment)",
            paymentMethod: "credit_card",
            notes: "Auto-recorded upon bill clearance",
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          // Variable Expenses
          {
            id: `exp_var_1${idSuffix}`,
            userId: defaultUserId,
            billId: null,
            type: "variable",
            categoryId: getCatId("Groceries"),
            amountPaise: 425e3,
            // ₹4,250.00
            date: `${currentYear}-${currentMonth}-03`,
            description: "Organic Supermarket & Fresh Produce",
            paymentMethod: "credit_card",
            notes: "Weekly household restocking",
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `exp_var_2${idSuffix}`,
            userId: defaultUserId,
            billId: null,
            type: "variable",
            categoryId: getCatId("Food"),
            amountPaise: 185e3,
            // ₹1,850.00
            date: `${currentYear}-${currentMonth}-05`,
            description: "Artisan Bistro Dinner with Team",
            paymentMethod: "upi_bank",
            notes: "Project celebration dinner",
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `exp_var_3${idSuffix}`,
            userId: defaultUserId,
            billId: null,
            type: "variable",
            categoryId: getCatId("Transportation"),
            amountPaise: 14e4,
            // ₹1,400.00
            date: `${currentYear}-${currentMonth}-07`,
            description: "Fuel & Metro Travel Pass",
            paymentMethod: "debit_card",
            notes: "Commute expenses",
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `exp_var_4${idSuffix}`,
            userId: defaultUserId,
            billId: null,
            type: "variable",
            categoryId: getCatId("Shopping"),
            amountPaise: 38e4,
            // ₹3,800.00
            date: `${currentYear}-${currentMonth}-08`,
            description: "Mechanical Keyboard & Desk Ergonomics",
            paymentMethod: "credit_card",
            notes: "Home office workstation upgrade",
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `exp_var_5${idSuffix}`,
            userId: defaultUserId,
            billId: null,
            type: "variable",
            categoryId: getCatId("Food"),
            amountPaise: 65e3,
            // ₹650.00
            date: `${currentYear}-${currentMonth}-10`,
            description: "Specialty Coffee & Espresso Beans",
            paymentMethod: "upi_bank",
            notes: "Focus brew beans",
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        );
        this.db.savingsGoals.push(
          {
            id: `sav_1${idSuffix}`,
            userId: defaultUserId,
            title: "6-Month Emergency Reserve",
            targetPaise: 6e7,
            // ₹6,00,000.00
            savedPaise: 325e5,
            // ₹3,25,000.00
            targetDate: `${currentYear + 1}-06-30`,
            color: "#10b981",
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: `sav_2${idSuffix}`,
            userId: defaultUserId,
            title: "Workstation & Studio Upgrade",
            targetPaise: 12e6,
            // ₹1,20,000.00
            savedPaise: 78e5,
            // ₹78,000.00
            targetDate: `${currentYear}-12-31`,
            color: "#6366f1",
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        );
        if (!this.isPersistenceDegraded) {
          this.save().catch((err) => {
            console.warn(`[DB] Notice: Could not persist seed data to disk (${err?.message || err}). In-memory seed active.`);
          });
        }
      }
      /**
       * Automatically generate recurring bills for the current period and mark overdue bills.
       * - Respects cadence (monthly, quarterly, yearly).
       * - Computes correct month-end boundaries using days in current month.
       * - Enforces deterministic bill IDs to guarantee idempotency.
       */
      checkRecurringBills(userId = "usr_atif_default") {
        const userSettings = this.db.userSettings.find((s) => s.userId === userId);
        const tz = userSettings?.timezone || DEFAULT_TIMEZONE;
        const todayStr = getTodayDateString(tz);
        const parsedToday = parseDateString(todayStr) || { year: 2026, month: 11, day: 12 };
        const currentYear = parsedToday.year;
        const currentMonth = parsedToday.month;
        const periodKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
        let changed = false;
        const recurringList = this.db.recurringExpenses.filter((r) => r.userId === userId && r.isActive !== false);
        for (const rec of recurringList) {
          if (rec.recurrence === "quarterly") {
            const createdParsed = rec.createdAt ? parseDateString(rec.createdAt.slice(0, 10)) : null;
            const createdMonth = createdParsed ? createdParsed.month : 1;
            if (Math.abs(currentMonth - createdMonth) % 3 !== 0) {
              continue;
            }
          } else if (rec.recurrence === "yearly") {
            const createdParsed = rec.createdAt ? parseDateString(rec.createdAt.slice(0, 10)) : null;
            const createdMonth = createdParsed ? createdParsed.month : 1;
            if (currentMonth !== createdMonth) {
              continue;
            }
          }
          const billId = `bill_${rec.id}_${periodKey}`;
          const existing = this.db.bills.find(
            (b) => b.id === billId || b.userId === userId && b.recurringExpenseId === rec.id && b.periodKey === periodKey
          );
          if (!existing) {
            const maxDays = getDaysInMonth(currentYear, currentMonth);
            const dueDay = Math.min(Math.max(Math.round(rec.dueDay || 1), 1), maxDays);
            const dueDate = formatYmd(currentYear, currentMonth, dueDay);
            const isPastDue = dueDate < todayStr;
            const newBill = {
              id: billId,
              userId,
              recurringExpenseId: rec.id,
              name: rec.name,
              amountPaise: rec.amountPaise,
              categoryId: rec.categoryId,
              dueDate,
              status: isPastDue ? "OVERDUE" : "UNPAID",
              paymentDate: null,
              notes: rec.notes || `Recurring ${rec.recurrence} expense`,
              periodKey,
              deletedAt: null,
              createdAt: (/* @__PURE__ */ new Date()).toISOString(),
              updatedAt: (/* @__PURE__ */ new Date()).toISOString()
            };
            this.db.bills.push(newBill);
            changed = true;
          }
        }
        for (const bill of this.db.bills) {
          if (!bill.deletedAt && bill.userId === userId && bill.status === "UNPAID" && bill.dueDate < todayStr) {
            bill.status = "OVERDUE";
            bill.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
            changed = true;
          }
        }
        if (changed) {
          if (!this.isPersistenceDegraded) {
            this.save().catch((err) => {
              console.warn(`[DB] Notice: Could not persist recurring bills to disk (${err?.message || err}).`);
            });
          }
        }
      }
      // Transaction support: Mark bill as paid atomically & idempotently
      markBillAsPaid(userId, billId, paidDate, paymentMethod = "upi_bank", notes, idempotencyKey) {
        const bill = this.db.bills.find((b) => b.id === billId && b.userId === userId);
        if (!bill) {
          return { success: false, error: "Bill not found" };
        }
        if (idempotencyKey && bill.lastPaymentIdempotencyKey === idempotencyKey && bill.status === "PAID") {
          return { success: true, bill };
        }
        if (bill.status === "PAID") {
          return { success: false, error: "Bill is already marked as paid" };
        }
        const userSettings = this.db.userSettings.find((s) => s.userId === userId);
        const tz = userSettings?.timezone || DEFAULT_TIMEZONE;
        const effectivePaidDate = paidDate || getTodayDateString(tz);
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const paymentId = `pay_${bill.id}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        bill.status = "PAID";
        bill.paymentDate = effectivePaidDate;
        bill.lastPaymentId = paymentId;
        if (idempotencyKey) {
          bill.lastPaymentIdempotencyKey = idempotencyKey;
        }
        bill.updatedAt = nowIso;
        const paymentRecord = {
          id: paymentId,
          userId,
          billId: bill.id,
          billName: bill.name,
          amountPaise: bill.amountPaise,
          paidDate: effectivePaidDate,
          paymentMethod,
          transactionRef: `REF-${bill.id}-${Date.now().toString(36).toUpperCase()}`,
          idempotencyKey,
          notes: notes || "Bill payment recorded",
          status: "completed",
          createdAt: nowIso
        };
        this.db.paymentHistory.push(paymentRecord);
        const existingExpense = this.db.expenseTransactions.find(
          (e) => e.id === `exp_bill_${bill.id}` && e.userId === userId
        );
        if (existingExpense) {
          existingExpense.billId = bill.id;
          existingExpense.type = "fixed";
          existingExpense.categoryId = bill.categoryId;
          existingExpense.amountPaise = bill.amountPaise;
          existingExpense.date = effectivePaidDate;
          existingExpense.description = `${bill.name} (Bill payment)`;
          existingExpense.paymentMethod = paymentMethod;
          existingExpense.notes = notes || "Paid bill expense";
          existingExpense.deletedAt = null;
        } else {
          const expenseTx = {
            id: `exp_bill_${bill.id}`,
            userId,
            billId: bill.id,
            type: "fixed",
            categoryId: bill.categoryId,
            amountPaise: bill.amountPaise,
            date: effectivePaidDate,
            description: `${bill.name} (Bill payment)`,
            paymentMethod,
            notes: notes || "Paid bill expense",
            deletedAt: null,
            createdAt: nowIso
          };
          this.db.expenseTransactions.push(expenseTx);
        }
        this.db.auditLogs.push({
          id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          userId,
          action: "pay",
          entityType: "bill",
          entityId: bill.id,
          entityTitle: bill.name,
          details: `Paid ${bill.amountPaise} paise via ${paymentMethod}`,
          timestamp: nowIso
        });
        this.save();
        return { success: true, bill };
      }
      payBill(userId, billId, paidDate, paymentMethod = "upi_bank", notes, idempotencyKey) {
        return this.markBillAsPaid(userId, billId, paidDate, paymentMethod, notes, idempotencyKey);
      }
      // Safe undo payment: preserve historical payment record with 'reversed' status
      undoBillPayment(userId, billId) {
        const bill = this.db.bills.find((b) => b.id === billId && b.userId === userId);
        if (!bill) {
          return { success: false, error: "Bill not found" };
        }
        if (bill.status !== "PAID") {
          return { success: false, error: "Bill is not marked as paid" };
        }
        const userSettings = this.db.userSettings.find((s) => s.userId === userId);
        const tz = userSettings?.timezone || DEFAULT_TIMEZONE;
        const todayStr = getTodayDateString(tz);
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        bill.status = bill.dueDate < todayStr ? "OVERDUE" : "UNPAID";
        bill.paymentDate = null;
        bill.updatedAt = nowIso;
        for (const p of this.db.paymentHistory) {
          if (p.userId === userId && p.billId === billId && p.status !== "reversed") {
            p.status = "reversed";
            p.reversedAt = nowIso;
          }
        }
        for (const e of this.db.expenseTransactions) {
          if (e.userId === userId && e.billId === billId && !e.deletedAt) {
            e.deletedAt = nowIso;
          }
        }
        this.db.auditLogs.push({
          id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          userId,
          action: "undo_payment",
          entityType: "bill",
          entityId: bill.id,
          entityTitle: bill.name,
          details: `Reversed payment for bill ${bill.name}`,
          timestamp: nowIso
        });
        this.save();
        return { success: true, bill };
      }
      // --- TIME BLOCKS ---
      getTimeBlocks(userId, date) {
        this.db.timeBlocks = this.db.timeBlocks || [];
        return this.db.timeBlocks.filter((tb) => tb.userId === userId && !tb.deletedAt && (!date || tb.date === date)).sort((a, b) => a.startMinute - b.startMinute);
      }
      saveTimeBlock(userId, input) {
        this.db.timeBlocks = this.db.timeBlocks || [];
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const id = input.id || `tb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const idx = this.db.timeBlocks.findIndex((tb) => tb.id === id && tb.userId === userId);
        const existing = idx >= 0 ? this.db.timeBlocks[idx] : void 0;
        const rawStart = input.startMinute !== void 0 ? Number(input.startMinute) : Number(existing?.startMinute ?? 0);
        const startMinute = Math.max(0, Math.min(1439, Number.isFinite(rawStart) ? Math.round(rawStart) : 0));
        const rawEnd = input.endMinute !== void 0 ? Number(input.endMinute) : Number(existing?.endMinute ?? 60);
        const endMinute = Math.max(startMinute + 1, Math.min(1440, Number.isFinite(rawEnd) ? Math.round(rawEnd) : startMinute + 60));
        const block = {
          id,
          userId,
          date: input.date ?? existing?.date ?? getTodayDateString(DEFAULT_TIMEZONE),
          title: (input.title ?? existing?.title ?? "Focus Block").trim() || "Focus Block",
          startMinute,
          endMinute,
          category: input.category ?? existing?.category ?? "Focus",
          taskId: input.taskId !== void 0 ? input.taskId : existing?.taskId ?? null,
          revisionId: input.revisionId !== void 0 ? input.revisionId : existing?.revisionId ?? null,
          completed: input.completed !== void 0 ? Boolean(input.completed) : Boolean(existing?.completed),
          notes: input.notes !== void 0 ? input.notes : existing?.notes ?? "",
          deletedAt: input.deletedAt !== void 0 ? input.deletedAt : existing?.deletedAt ?? null,
          createdAt: existing ? existing.createdAt : nowIso,
          updatedAt: nowIso
        };
        if (idx >= 0) {
          this.db.timeBlocks[idx] = block;
        } else {
          this.db.timeBlocks.push(block);
        }
        this.save();
        return block;
      }
      deleteTimeBlock(userId, id) {
        this.db.timeBlocks = this.db.timeBlocks || [];
        const block = this.db.timeBlocks.find((tb) => tb.id === id && tb.userId === userId);
        if (!block) return false;
        block.deletedAt = (/* @__PURE__ */ new Date()).toISOString();
        block.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.save();
        return true;
      }
      // --- ENVELOPE BUDGETING ---
      getEnvelopes(userId, monthKey) {
        this.db.envelopes = this.db.envelopes || [];
        const currentMonthKey = monthKey || getTodayDateString(DEFAULT_TIMEZONE).slice(0, 7);
        return this.db.envelopes.filter((env) => env.userId === userId && !env.deletedAt && (!monthKey || env.monthKey === currentMonthKey)).map((env) => {
          let spent = 0;
          if (env.categoryId) {
            spent = this.db.expenseTransactions.filter((e) => e.userId === userId && !e.deletedAt && e.categoryId === env.categoryId && e.date.startsWith(env.monthKey)).reduce((sum, e) => sum + (e.amountPaise || 0), 0);
          }
          return {
            ...env,
            spentPaise: spent
          };
        });
      }
      saveEnvelope(userId, input) {
        this.db.envelopes = this.db.envelopes || [];
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const id = input.id || `env_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const idx = this.db.envelopes.findIndex((env2) => env2.id === id && env2.userId === userId);
        const env = {
          id,
          userId,
          name: (input.name || "Envelope").trim(),
          categoryId: input.categoryId || null,
          allocatedPaise: Math.max(0, Math.floor(Number(input.allocatedPaise) || 0)),
          monthKey: input.monthKey || getTodayDateString(DEFAULT_TIMEZONE).slice(0, 7),
          color: input.color || "#6366f1",
          notes: input.notes || "",
          deletedAt: input.deletedAt || null,
          createdAt: idx >= 0 ? this.db.envelopes[idx].createdAt : nowIso,
          updatedAt: nowIso
        };
        if (idx >= 0) {
          this.db.envelopes[idx] = env;
        } else {
          this.db.envelopes.push(env);
        }
        this.save();
        return env;
      }
      transferEnvelopeFunds(userId, fromId, toId, amountPaise) {
        this.db.envelopes = this.db.envelopes || [];
        const fromEnv = this.db.envelopes.find((e) => e.id === fromId && e.userId === userId && !e.deletedAt);
        const toEnv = this.db.envelopes.find((e) => e.id === toId && e.userId === userId && !e.deletedAt);
        if (!fromEnv || !toEnv) return { success: false, error: "Envelope not found" };
        if (amountPaise <= 0) return { success: false, error: "Transfer amount must be positive" };
        if (fromEnv.allocatedPaise < amountPaise) {
          return { success: false, error: "Source envelope has insufficient funds" };
        }
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        fromEnv.allocatedPaise -= amountPaise;
        fromEnv.updatedAt = nowIso;
        toEnv.allocatedPaise += amountPaise;
        toEnv.updatedAt = nowIso;
        this.recordAuditLog(userId, {
          action: "envelope_transfer",
          entityType: "envelope",
          entityId: fromId,
          entityTitle: `${fromEnv.name} -> ${toEnv.name}`,
          details: `Transferred ${amountPaise} paise from ${fromEnv.name} to ${toEnv.name}`
        });
        this.save();
        return { success: true };
      }
      deleteEnvelope(userId, id) {
        this.db.envelopes = this.db.envelopes || [];
        const env = this.db.envelopes.find((e) => e.id === id && e.userId === userId);
        if (!env) return false;
        env.deletedAt = (/* @__PURE__ */ new Date()).toISOString();
        env.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.save();
        return true;
      }
      // --- SUBSCRIPTIONS ---
      getSubscriptions(userId) {
        this.db.subscriptions = this.db.subscriptions || [];
        return this.db.subscriptions.filter((s) => s.userId === userId && !s.deletedAt).sort((a, b) => a.nextRenewalDate.localeCompare(b.nextRenewalDate));
      }
      saveSubscription(userId, input) {
        this.db.subscriptions = this.db.subscriptions || [];
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const id = input.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const idx = this.db.subscriptions.findIndex((s) => s.id === id && s.userId === userId);
        const sub = {
          id,
          userId,
          name: (input.name || "Subscription").trim(),
          amountPaise: Math.max(0, Math.floor(Number(input.amountPaise) || 0)),
          categoryId: input.categoryId || "cat_subscriptions",
          billingCycle: input.billingCycle || "monthly",
          nextRenewalDate: input.nextRenewalDate || getTodayDateString(DEFAULT_TIMEZONE),
          reminderDays: Math.max(0, Number(input.reminderDays) || 3),
          autoRenew: input.autoRenew !== false,
          status: input.status || "active",
          websiteUrl: input.websiteUrl || "",
          notes: input.notes || "",
          deletedAt: input.deletedAt || null,
          createdAt: idx >= 0 ? this.db.subscriptions[idx].createdAt : nowIso,
          updatedAt: nowIso
        };
        if (idx >= 0) {
          this.db.subscriptions[idx] = sub;
        } else {
          this.db.subscriptions.push(sub);
        }
        this.save();
        return sub;
      }
      deleteSubscription(userId, id) {
        this.db.subscriptions = this.db.subscriptions || [];
        const sub = this.db.subscriptions.find((s) => s.id === id && s.userId === userId);
        if (!sub) return false;
        sub.deletedAt = (/* @__PURE__ */ new Date()).toISOString();
        sub.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.save();
        return true;
      }
      // --- AUDIT LOGS ---
      getAuditLogs(userId, limit = 100) {
        this.db.auditLogs = this.db.auditLogs || [];
        return this.db.auditLogs.filter((l) => l.userId === userId).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
      }
      recordAuditLog(userId, entry) {
        this.db.auditLogs = this.db.auditLogs || [];
        const log = {
          id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          userId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          entityTitle: entry.entityTitle || "",
          details: entry.details || "",
          timestamp: entry.timestamp || (/* @__PURE__ */ new Date()).toISOString()
        };
        this.db.auditLogs.push(log);
        if (this.db.auditLogs.length > 2e3) {
          this.db.auditLogs = this.db.auditLogs.slice(-1500);
        }
        this.save();
        return log;
      }
      // --- DURABLE SYNC QUEUE ---
      getSyncQueue(userId) {
        this.db.syncQueue = this.db.syncQueue || [];
        return this.db.syncQueue.filter((sq) => sq.userId === userId && sq.status !== "completed");
      }
      enqueueSync(userId, op) {
        this.db.syncQueue = this.db.syncQueue || [];
        const dedupeKey = typeof op.dedupeKey === "string" && op.dedupeKey.trim() ? op.dedupeKey.trim() : void 0;
        if (dedupeKey) {
          const existing = this.db.syncQueue.find(
            (sq) => sq.userId === userId && sq.dedupeKey === dedupeKey && sq.status !== "completed"
          );
          if (existing) {
            existing.payload = op.payload;
            existing.action = op.action;
            existing.entityType = op.entityType;
            existing.sheetName = op.sheetName;
            existing.status = "pending";
            existing.nextRetryAt = null;
            existing.errorMessage = null;
            this.save();
            return existing;
          }
        }
        const item = {
          id: `sync_op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          userId,
          entityType: op.entityType,
          action: op.action,
          sheetName: op.sheetName,
          payload: op.payload,
          dedupeKey,
          status: "pending",
          attempts: 0,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        this.db.syncQueue.push(item);
        this.save();
        return item;
      }
      updateSyncOp(userId, id, updates) {
        this.db.syncQueue = this.db.syncQueue || [];
        const item = this.db.syncQueue.find((sq) => sq.id === id && sq.userId === userId);
        if (!item) return null;
        Object.assign(item, updates);
        this.save();
        return item;
      }
      // --- DATA RECOVERY & BACKUPS ---
      exportUserData(userId) {
        const backup = {
          version: "2.0.0",
          exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
          userId,
          userSettings: this.db.userSettings.find((s) => s.userId === userId) || null,
          tasks: this.db.tasks.filter((t) => t.userId === userId),
          focusSessions: this.db.focusSessions.filter((s) => s.userId === userId),
          categories: this.db.categories.filter((c) => c.userId === userId),
          recurringExpenses: this.db.recurringExpenses.filter((r) => r.userId === userId),
          bills: this.db.bills.filter((b) => b.userId === userId),
          paymentHistory: this.db.paymentHistory.filter((p) => p.userId === userId),
          incomeTransactions: this.db.incomeTransactions.filter((i) => i.userId === userId),
          expenseTransactions: this.db.expenseTransactions.filter((e) => e.userId === userId),
          savingsGoals: this.db.savingsGoals.filter((g) => g.userId === userId),
          timeBlocks: (this.db.timeBlocks || []).filter((tb) => tb.userId === userId),
          envelopes: (this.db.envelopes || []).filter((env) => env.userId === userId),
          subscriptions: (this.db.subscriptions || []).filter((sub) => sub.userId === userId),
          studySubjects: (this.db.studySubjects || []).filter((s) => s.userId === userId),
          studyTopics: (this.db.studyTopics || []).filter((t) => t.userId === userId),
          studyRevisions: (this.db.studyRevisions || []).filter((r) => r.userId === userId),
          studyMistakes: (this.db.studyMistakes || []).filter((m) => m.userId === userId),
          studyTiers: (this.db.studyTiers || []).filter((st) => st.userId === userId),
          auditLogs: (this.db.auditLogs || []).filter((l) => l.userId === userId)
        };
        return backup;
      }
      restoreUserData(userId, data) {
        if (!data || typeof data !== "object") {
          return { success: false, counts: {}, errors: ["Invalid backup JSON structure"] };
        }
        const counts = {};
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        if (data.userSettings && typeof data.userSettings === "object") {
          const existingIdx = this.db.userSettings.findIndex((s) => s.userId === userId);
          const restoredSettings = {
            ...data.userSettings,
            userId,
            updatedAt: nowIso
          };
          if (existingIdx >= 0) {
            this.db.userSettings[existingIdx] = restoredSettings;
          } else {
            this.db.userSettings.push(restoredSettings);
          }
          counts.userSettings = 1;
        }
        if (Array.isArray(data.tasks)) {
          this.db.tasks = this.db.tasks.filter((t) => t.userId !== userId);
          for (const item of data.tasks) {
            if (item && item.id && item.title) {
              this.db.tasks.push({ ...item, userId });
            }
          }
          counts.tasks = this.db.tasks.filter((t) => t.userId === userId).length;
        }
        if (Array.isArray(data.focusSessions)) {
          this.db.focusSessions = this.db.focusSessions.filter((s) => s.userId !== userId);
          for (const item of data.focusSessions) {
            if (item && item.id) {
              this.db.focusSessions.push({ ...item, userId });
            }
          }
          counts.focusSessions = this.db.focusSessions.filter((s) => s.userId === userId).length;
        }
        if (Array.isArray(data.categories)) {
          this.db.categories = this.db.categories.filter((c) => c.userId !== userId);
          for (const item of data.categories) {
            if (item && item.id && item.name) {
              this.db.categories.push({ ...item, userId });
            }
          }
          counts.categories = this.db.categories.filter((c) => c.userId === userId).length;
        }
        if (Array.isArray(data.recurringExpenses)) {
          this.db.recurringExpenses = this.db.recurringExpenses.filter((r) => r.userId !== userId);
          for (const item of data.recurringExpenses) {
            if (item && item.id && item.name) {
              this.db.recurringExpenses.push({ ...item, userId });
            }
          }
          counts.recurringExpenses = this.db.recurringExpenses.filter((r) => r.userId === userId).length;
        }
        if (Array.isArray(data.incomeTransactions)) {
          this.db.incomeTransactions = this.db.incomeTransactions.filter((i) => i.userId !== userId);
          for (const item of data.incomeTransactions) {
            if (item && item.id && item.source) {
              this.db.incomeTransactions.push({ ...item, userId });
            }
          }
          counts.incomeTransactions = this.db.incomeTransactions.filter((i) => i.userId === userId).length;
        }
        if (Array.isArray(data.expenseTransactions)) {
          this.db.expenseTransactions = this.db.expenseTransactions.filter((e) => e.userId !== userId);
          for (const item of data.expenseTransactions) {
            if (item && item.id && item.amountPaise !== void 0) {
              this.db.expenseTransactions.push({ ...item, userId });
            }
          }
          counts.expenseTransactions = this.db.expenseTransactions.filter((e) => e.userId === userId).length;
        }
        if (Array.isArray(data.savingsGoals)) {
          this.db.savingsGoals = this.db.savingsGoals.filter((g) => g.userId !== userId);
          for (const item of data.savingsGoals) {
            if (item && item.id && item.title) {
              this.db.savingsGoals.push({ ...item, userId });
            }
          }
          counts.savingsGoals = this.db.savingsGoals.filter((g) => g.userId === userId).length;
        }
        if (Array.isArray(data.bills)) {
          this.db.bills = this.db.bills.filter((b) => b.userId !== userId);
          for (const item of data.bills) {
            if (item && item.id && item.name) {
              this.db.bills.push({ ...item, userId });
            }
          }
          counts.bills = this.db.bills.filter((b) => b.userId === userId).length;
        }
        if (Array.isArray(data.paymentHistory)) {
          this.db.paymentHistory = this.db.paymentHistory.filter((p) => p.userId !== userId);
          for (const item of data.paymentHistory) {
            if (item && item.id && item.billId) {
              this.db.paymentHistory.push({ ...item, userId });
            }
          }
          counts.paymentHistory = this.db.paymentHistory.filter((p) => p.userId === userId).length;
        }
        if (Array.isArray(data.timeBlocks)) {
          this.db.timeBlocks = (this.db.timeBlocks || []).filter((tb) => tb.userId !== userId);
          for (const item of data.timeBlocks) {
            if (item && item.id && item.title) {
              this.db.timeBlocks.push({ ...item, userId });
            }
          }
          counts.timeBlocks = this.db.timeBlocks.filter((tb) => tb.userId === userId).length;
        }
        if (Array.isArray(data.envelopes)) {
          this.db.envelopes = (this.db.envelopes || []).filter((env) => env.userId !== userId);
          for (const item of data.envelopes) {
            if (item && item.id && item.name) {
              this.db.envelopes.push({ ...item, userId });
            }
          }
          counts.envelopes = this.db.envelopes.filter((env) => env.userId === userId).length;
        }
        if (Array.isArray(data.subscriptions)) {
          this.db.subscriptions = (this.db.subscriptions || []).filter((sub) => sub.userId !== userId);
          for (const item of data.subscriptions) {
            if (item && item.id && item.name) {
              this.db.subscriptions.push({ ...item, userId });
            }
          }
          counts.subscriptions = this.db.subscriptions.filter((sub) => sub.userId === userId).length;
        }
        if (Array.isArray(data.studySubjects)) {
          this.db.studySubjects = (this.db.studySubjects || []).filter((s) => s.userId !== userId);
          for (const item of data.studySubjects) {
            if (item && item.id && item.code) {
              this.db.studySubjects.push({ ...item, userId });
            }
          }
          counts.studySubjects = this.db.studySubjects.filter((s) => s.userId === userId).length;
        }
        if (Array.isArray(data.studyTopics)) {
          this.db.studyTopics = (this.db.studyTopics || []).filter((t) => t.userId !== userId);
          for (const item of data.studyTopics) {
            if (item && item.id && item.subjectCode) {
              this.db.studyTopics.push({ ...item, userId });
            }
          }
          counts.studyTopics = this.db.studyTopics.filter((t) => t.userId === userId).length;
        }
        if (Array.isArray(data.studyRevisions)) {
          this.db.studyRevisions = (this.db.studyRevisions || []).filter((r) => r.userId !== userId);
          for (const item of data.studyRevisions) {
            if (item && item.id && item.topicId) {
              this.db.studyRevisions.push({ ...item, userId });
            }
          }
          counts.studyRevisions = this.db.studyRevisions.filter((r) => r.userId === userId).length;
        }
        if (Array.isArray(data.studyMistakes)) {
          this.db.studyMistakes = (this.db.studyMistakes || []).filter((m) => m.userId !== userId);
          for (const item of data.studyMistakes) {
            if (item && item.id && item.trap) {
              this.db.studyMistakes.push({ ...item, userId });
            }
          }
          counts.studyMistakes = this.db.studyMistakes.filter((m) => m.userId === userId).length;
        }
        if (Array.isArray(data.studyTiers)) {
          this.db.studyTiers = (this.db.studyTiers || []).filter((st) => st.userId !== userId);
          for (const item of data.studyTiers) {
            if (item && item.id && item.name) {
              this.db.studyTiers.push({ ...item, userId });
            }
          }
          counts.studyTiers = (this.db.studyTiers || []).filter((st) => st.userId === userId).length;
        }
        this.recordAuditLog(userId, {
          action: "backup_restore",
          entityType: "backup",
          entityId: `rst_${Date.now()}`,
          entityTitle: "Data Recovery Restore",
          details: `Restored records: ${JSON.stringify(counts)}`
        });
        this.save();
        return { success: true, counts };
      }
      // --- STUDY MANAGEMENT CRUD METHODS ---
      clearStudyData(userId) {
        this.db.studySubjects = (this.db.studySubjects || []).filter((s) => s.userId !== userId);
        this.db.studyTopics = (this.db.studyTopics || []).filter((t) => t.userId !== userId);
        this.db.studyRevisions = (this.db.studyRevisions || []).filter((r) => r.userId !== userId);
        this.db.studyMistakes = (this.db.studyMistakes || []).filter((m) => m.userId !== userId);
        this.save();
      }
      getStudyTiers(userId) {
        const list = this.db.studyTiers || [];
        return list.filter((t) => (!t.userId || t.userId === userId) && !t.deletedAt);
      }
      saveStudyTier(userId, input) {
        this.db.studyTiers = this.db.studyTiers || [];
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const id = input.id || `tier_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const existingIdx = this.db.studyTiers.findIndex((t) => t.id === id);
        const tier = {
          id: existingIdx >= 0 ? this.db.studyTiers[existingIdx].id : id,
          userId,
          name: (input.name || "Academic Tier").trim(),
          shortTitle: (input.shortTitle || input.name || "Tier").trim(),
          description: (input.description || "").trim(),
          subjectCodes: input.subjectCodes || [],
          createdAt: existingIdx >= 0 ? this.db.studyTiers[existingIdx].createdAt : nowIso,
          updatedAt: nowIso,
          deletedAt: input.deletedAt || null
        };
        if (existingIdx >= 0) {
          this.db.studyTiers[existingIdx] = tier;
        } else {
          this.db.studyTiers.push(tier);
        }
        this.save();
        return tier;
      }
      deleteStudyTier(userId, id) {
        this.db.studyTiers = this.db.studyTiers || [];
        const idx = this.db.studyTiers.findIndex((t) => t.id === id && t.userId === userId);
        if (idx === -1) return false;
        this.db.studyTiers[idx].deletedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.save();
        return true;
      }
      getStudySubjects(userId) {
        const list = this.db.studySubjects || [];
        return list.filter((s) => s.userId === userId && !s.deletedAt);
      }
      saveStudySubject(userId, input) {
        this.db.studySubjects = this.db.studySubjects || [];
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const id = input.id || `subj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const code = (input.code || `SUB_${Date.now().toString(36).toUpperCase()}`).trim();
        const existingIdx = this.db.studySubjects.findIndex((s) => s.userId === userId && (s.id === id || s.code === code));
        const subject = {
          id: existingIdx >= 0 ? this.db.studySubjects[existingIdx].id : id,
          userId,
          code,
          name: (input.name || "Subject").trim(),
          tierId: input.tierId || "tier1_sem3",
          semesterOrDomain: input.semesterOrDomain || "",
          targetExam: input.targetExam || "",
          totalSubtopics: Number(input.totalSubtopics) || 0,
          completedSubtopics: Number(input.completedSubtopics) || 0,
          color: input.color || "#3b82f6",
          createdAt: existingIdx >= 0 ? this.db.studySubjects[existingIdx].createdAt : nowIso,
          updatedAt: nowIso,
          deletedAt: input.deletedAt || null
        };
        if (existingIdx >= 0) {
          this.db.studySubjects[existingIdx] = subject;
        } else {
          this.db.studySubjects.push(subject);
        }
        this.save();
        return subject;
      }
      deleteStudySubject(userId, codeOrId) {
        this.db.studySubjects = this.db.studySubjects || [];
        this.db.studyTopics = this.db.studyTopics || [];
        const targetSub = this.db.studySubjects.find(
          (s) => s.userId === userId && !s.deletedAt && (s.id === codeOrId || s.code === codeOrId || s.code.toLowerCase() === codeOrId.toLowerCase())
        );
        if (!targetSub) {
          return { success: false, deletedCount: 0 };
        }
        const previousSubjects = JSON.parse(JSON.stringify(this.db.studySubjects));
        const previousTopics = JSON.parse(JSON.stringify(this.db.studyTopics));
        try {
          const nowIso = (/* @__PURE__ */ new Date()).toISOString();
          targetSub.deletedAt = nowIso;
          targetSub.updatedAt = nowIso;
          const matchingTopics = this.db.studyTopics.filter(
            (t) => t.userId === userId && !t.deletedAt && t.subjectCode === targetSub.code
          );
          for (const t of matchingTopics) {
            t.deletedAt = nowIso;
            t.updatedAt = nowIso;
          }
          this.save();
          return {
            success: true,
            deletedCount: 1 + matchingTopics.length,
            subjectCode: targetSub.code
          };
        } catch (err) {
          this.db.studySubjects = previousSubjects;
          this.db.studyTopics = previousTopics;
          throw err;
        }
      }
      cleanupOverviewImportData(userId) {
        this.db.studySubjects = this.db.studySubjects || [];
        this.db.studyTopics = this.db.studyTopics || [];
        const isOverview = (code, name) => {
          const c = (code || "").toLowerCase();
          const n = (name || "").toLowerCase();
          return c === "sub_overview" || c.startsWith("sub_overview_") || c === "sub_over" || n === "overview" || n === "summary";
        };
        const targetSubs = this.db.studySubjects.filter(
          (s) => s.userId === userId && !s.deletedAt && isOverview(s.code, s.name)
        );
        const targetCodes = new Set(targetSubs.map((s) => s.code));
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        for (const s of targetSubs) {
          s.deletedAt = nowIso;
          s.updatedAt = nowIso;
        }
        const matchingTopics = this.db.studyTopics.filter(
          (t) => t.userId === userId && !t.deletedAt && targetCodes.has(t.subjectCode)
        );
        for (const t of matchingTopics) {
          t.deletedAt = nowIso;
          t.updatedAt = nowIso;
        }
        if (targetSubs.length > 0 || matchingTopics.length > 0) {
          this.save();
        }
        return {
          success: true,
          removedSubjects: targetSubs.map((s) => s.code),
          removedTopicsCount: matchingTopics.length
        };
      }
      undoImportSession(userId, sessionId, force) {
        this.db.studySubjects = this.db.studySubjects || [];
        this.db.studyTopics = this.db.studyTopics || [];
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        let removedTopicsCount = 0;
        let preservedTopicsWithProgressCount = 0;
        const userTopics = this.db.studyTopics.filter((t) => t.userId === userId && !t.deletedAt);
        const affectedSubjectCodes = /* @__PURE__ */ new Set();
        for (const t of userTopics) {
          if (t.sourceSessionId === sessionId || t.sessionId === sessionId) {
            if (!force && (t.practice || t.revisionCount > 0)) {
              preservedTopicsWithProgressCount++;
            } else {
              t.deletedAt = nowIso;
              t.updatedAt = nowIso;
              removedTopicsCount++;
              affectedSubjectCodes.add(t.subjectCode);
            }
          }
        }
        let removedSubjectsCount = 0;
        for (const code of affectedSubjectCodes) {
          const remaining = this.db.studyTopics.some((t) => t.userId === userId && !t.deletedAt && t.subjectCode === code);
          if (!remaining) {
            const sub = this.db.studySubjects.find((s) => s.userId === userId && !s.deletedAt && s.code === code);
            if (sub) {
              sub.deletedAt = nowIso;
              sub.updatedAt = nowIso;
              removedSubjectsCount++;
            }
          }
        }
        if (removedTopicsCount > 0 || removedSubjectsCount > 0) {
          this.save();
        }
        return {
          success: true,
          removedTopicsCount,
          removedSubjectsCount,
          preservedTopicsWithProgressCount,
          sessionId
        };
      }
      getStudyTopics(userId, subjectCode) {
        const list = this.db.studyTopics || [];
        return list.filter((t) => t.userId === userId && !t.deletedAt && (!subjectCode || t.subjectCode === subjectCode)).sort((a, b) => (a.rowIndex || 0) - (b.rowIndex || 0));
      }
      saveStudyTopic(userId, input) {
        this.db.studyTopics = this.db.studyTopics || [];
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const id = input.id || `topic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const existingIdx = this.db.studyTopics.findIndex((t) => t.userId === userId && t.id === id);
        const existing = existingIdx >= 0 ? this.db.studyTopics[existingIdx] : void 0;
        const topic = {
          id,
          userId,
          subjectCode: existing?.subjectCode ?? input.subjectCode ?? "Sub_General",
          unit: input.unit ?? existing?.unit ?? "Unit 1",
          topic: input.topic ?? existing?.topic ?? "General Topic",
          subtopic: input.subtopic ?? existing?.subtopic ?? "Core Concept",
          priority: input.priority ?? existing?.priority ?? "Medium",
          theory: input.theory !== void 0 ? Boolean(input.theory) : Boolean(existing?.theory),
          practice: input.practice !== void 0 ? Boolean(input.practice) : Boolean(existing?.practice),
          pyq: input.pyq !== void 0 ? Boolean(input.pyq) : Boolean(existing?.pyq),
          revisionCount: Number(input.revisionCount ?? existing?.revisionCount ?? 0) || 0,
          notes: input.notes !== void 0 ? input.notes : existing?.notes ?? "",
          rowIndex: input.rowIndex !== void 0 ? input.rowIndex : existing?.rowIndex ?? 0,
          createdAt: existing ? existing.createdAt : nowIso,
          updatedAt: nowIso,
          deletedAt: input.deletedAt !== void 0 ? input.deletedAt : existing?.deletedAt ?? null
        };
        if (existingIdx >= 0) {
          this.db.studyTopics[existingIdx] = topic;
        } else {
          this.db.studyTopics.push(topic);
        }
        this.recomputeSubjectCounts(userId, topic.subjectCode);
        this.save();
        return topic;
      }
      recomputeSubjectCounts(userId, subjectCode) {
        const topics = (this.db.studyTopics || []).filter((t) => t.userId === userId && t.subjectCode === subjectCode && !t.deletedAt);
        const completed = topics.filter((t) => t.theory && t.practice).length;
        const subIdx = (this.db.studySubjects || []).findIndex((s) => s.userId === userId && s.code === subjectCode);
        if (subIdx >= 0 && this.db.studySubjects) {
          this.db.studySubjects[subIdx].totalSubtopics = topics.length;
          this.db.studySubjects[subIdx].completedSubtopics = completed;
          this.db.studySubjects[subIdx].updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        }
      }
      deleteStudyTopic(userId, topicId) {
        this.db.studyTopics = this.db.studyTopics || [];
        const idx = this.db.studyTopics.findIndex((t) => t.userId === userId && t.id === topicId);
        if (idx === -1) return false;
        const subjectCode = this.db.studyTopics[idx].subjectCode;
        this.db.studyTopics[idx].deletedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.recomputeSubjectCounts(userId, subjectCode);
        this.save();
        return true;
      }
      getStudyRevisions(userId) {
        const list = this.db.studyRevisions || [];
        return list.filter((r) => r.userId === userId && !r.deletedAt);
      }
      saveStudyRevision(userId, input) {
        this.db.studyRevisions = this.db.studyRevisions || [];
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const id = input.id || `rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const existingIdx = this.db.studyRevisions.findIndex((r) => r.userId === userId && r.id === id);
        const revision = {
          id,
          userId,
          topicId: input.topicId || "",
          subjectCode: input.subjectCode || "Sub_General",
          topicTitle: input.topicTitle || "Revision Topic",
          lastStudiedAt: input.lastStudiedAt || getTodayDateString(DEFAULT_TIMEZONE),
          nextRevisionAt: input.nextRevisionAt || getTodayDateString(DEFAULT_TIMEZONE),
          intervalDays: Number(input.intervalDays) || 1,
          repetition: Number(input.repetition) || 1,
          difficulty: input.difficulty || "medium",
          recallScore: input.recallScore,
          status: input.status || "scheduled",
          notes: input.notes || "",
          createdAt: existingIdx >= 0 ? this.db.studyRevisions[existingIdx].createdAt : nowIso,
          updatedAt: nowIso,
          deletedAt: input.deletedAt || null
        };
        if (existingIdx >= 0) {
          this.db.studyRevisions[existingIdx] = revision;
        } else {
          this.db.studyRevisions.push(revision);
        }
        this.save();
        return revision;
      }
      recordStudyRecall(userId, revisionId, difficulty) {
        this.db.studyRevisions = this.db.studyRevisions || [];
        const idx = this.db.studyRevisions.findIndex((r) => r.userId === userId && r.id === revisionId);
        if (idx === -1) return null;
        const rev = this.db.studyRevisions[idx];
        const userSettings = this.db.userSettings.find((s) => s.userId === userId);
        const tz = userSettings?.timezone || DEFAULT_TIMEZONE;
        const todayStr = getTodayDateString(tz);
        const ladder = [1, 3, 7, 14, 30, 60];
        const currentIdx = ladder.indexOf(rev.intervalDays);
        let nextInterval;
        let nextStatus = "scheduled";
        if (difficulty === "hard") {
          const newIdx = Math.max(0, (currentIdx >= 0 ? currentIdx : 0) - 1);
          nextInterval = ladder[newIdx];
        } else if (difficulty === "easy") {
          const newIdx = Math.min(ladder.length - 1, (currentIdx >= 0 ? currentIdx : 0) + 2);
          nextInterval = ladder[newIdx];
          if (newIdx >= ladder.length - 1) nextStatus = "mastered";
        } else {
          const newIdx = (currentIdx >= 0 ? currentIdx : 0) + 1;
          if (newIdx >= ladder.length - 1) {
            nextInterval = ladder[ladder.length - 1];
            nextStatus = "mastered";
          } else {
            nextInterval = ladder[newIdx];
          }
        }
        const nextDate = /* @__PURE__ */ new Date(`${todayStr}T12:00:00Z`);
        nextDate.setUTCDate(nextDate.getUTCDate() + nextInterval);
        const nextRevisionAt = nextDate.toISOString().slice(0, 10);
        const updated = {
          ...rev,
          lastStudiedAt: todayStr,
          nextRevisionAt,
          intervalDays: nextInterval,
          repetition: rev.repetition + 1,
          difficulty,
          status: nextStatus,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        this.db.studyRevisions[idx] = updated;
        this.save();
        return updated;
      }
      deleteStudyRevision(userId, revisionId) {
        this.db.studyRevisions = this.db.studyRevisions || [];
        const idx = this.db.studyRevisions.findIndex((r) => r.userId === userId && r.id === revisionId);
        if (idx === -1) return false;
        this.db.studyRevisions[idx].deletedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.save();
        return true;
      }
      getStudyMistakes(userId) {
        const list = this.db.studyMistakes || [];
        return list.filter((m) => m.userId === userId && !m.deletedAt);
      }
      saveStudyMistake(userId, input) {
        this.db.studyMistakes = this.db.studyMistakes || [];
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const id = input.id || `mistake_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const existingIdx = this.db.studyMistakes.findIndex((m) => m.userId === userId && m.id === id);
        const mistake = {
          id,
          userId,
          date: input.date || getTodayDateString(DEFAULT_TIMEZONE),
          subjectCode: input.subjectCode || "Sub_General",
          subjectName: input.subjectName || input.subjectCode || "General",
          topic: input.topic || "General Topic",
          source: input.source || "Practice",
          severity: input.severity || "Medium",
          trap: input.trap || "",
          rootCause: input.rootCause || "",
          goldenRule: input.goldenRule || "",
          resolved: Boolean(input.resolved),
          createdAt: existingIdx >= 0 ? this.db.studyMistakes[existingIdx].createdAt : nowIso,
          updatedAt: nowIso,
          deletedAt: input.deletedAt || null
        };
        if (existingIdx >= 0) {
          this.db.studyMistakes[existingIdx] = mistake;
        } else {
          this.db.studyMistakes.push(mistake);
        }
        this.save();
        return mistake;
      }
      deleteStudyMistake(userId, mistakeId) {
        this.db.studyMistakes = this.db.studyMistakes || [];
        const idx = this.db.studyMistakes.findIndex((m) => m.userId === userId && m.id === mistakeId);
        if (idx === -1) return false;
        this.db.studyMistakes[idx].deletedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.save();
        return true;
      }
      // ==========================================
      // JOINT VAULTS (COUPLE SHARED SAVINGS)
      // ==========================================
      ensureJointVaultsArrays() {
        if (!this.db.jointVaults) this.db.jointVaults = [];
        if (!this.db.vaultMembers) this.db.vaultMembers = [];
        if (!this.db.vaultInvitations) this.db.vaultInvitations = [];
        if (!this.db.vaultContributions) this.db.vaultContributions = [];
        if (!this.db.vaultExpenses) this.db.vaultExpenses = [];
        if (!this.db.vaultSettlements) this.db.vaultSettlements = [];
        if (!this.db.vaultActivities) this.db.vaultActivities = [];
      }
      createJointVault(data, creatorUser) {
        this.ensureJointVaultsArrays();
        if (data.id) {
          const existing = (this.db.jointVaults || []).find((v) => v.id === data.id);
          if (existing) return existing;
        }
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const vaultId = data.id || `vlt_${crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2, 8)}`;
        const currency = data.currency || "INR";
        const vault = {
          id: vaultId,
          name: data.name.trim(),
          description: (data.description || "").trim(),
          currency,
          targetPaise: data.targetPaise,
          monthlyTargetPaise: data.monthlyTargetPaise || Math.round(data.targetPaise / 10),
          createdBy: creatorUser.id,
          memberUids: [creatorUser.id],
          targetRatio: data.targetRatio && isValidRatio(data.targetRatio, [creatorUser.id]) ? data.targetRatio : { [creatorUser.id]: 100 },
          status: "active",
          createdAt: nowIso,
          updatedAt: nowIso
        };
        const creatorMember = {
          uid: creatorUser.id,
          email: creatorUser.email || `${creatorUser.id}@focusflow.app`,
          name: creatorUser.name || "Vault Creator",
          role: "creator",
          status: "active",
          joinedAt: nowIso
        };
        const activity = {
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          vaultId,
          actorUid: creatorUser.id,
          actorName: creatorMember.name,
          type: "vault_created",
          title: "Joint Vault Created",
          description: `${creatorMember.name} created the vault "${vault.name}"`,
          timestamp: nowIso
        };
        this.db.jointVaults.push(vault);
        this.db.vaultMembers.push(creatorMember);
        this.db.vaultActivities.push(activity);
        this.save();
        return vault;
      }
      getJointVaultsForUser(userId) {
        this.ensureJointVaultsArrays();
        const userVaults = (this.db.jointVaults || []).filter(
          (v) => v.memberUids.includes(userId)
        );
        return userVaults.map((vault) => this.getVaultSummary(vault.id, userId)).filter((v) => v !== null);
      }
      getVaultSummary(vaultId, userId) {
        this.ensureJointVaultsArrays();
        const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
        if (!vault) return null;
        if (!vault.memberUids.includes(userId)) return null;
        const members = (this.db.vaultMembers || []).filter(
          (m) => m.status === "active" && vault.memberUids.includes(m.uid)
        );
        const contributions = (this.db.vaultContributions || []).filter((c) => c.vaultId === vaultId);
        const expenses = (this.db.vaultExpenses || []).filter((e) => e.vaultId === vaultId);
        const settlements = (this.db.vaultSettlements || []).filter((s) => s.vaultId === vaultId);
        const activities = (this.db.vaultActivities || []).filter((a) => a.vaultId === vaultId);
        return buildVaultSummary(vault, members, contributions, expenses, settlements, activities);
      }
      getVault(vaultId, userId) {
        this.ensureJointVaultsArrays();
        const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
        if (!vault || !vault.memberUids.includes(userId)) return null;
        return vault;
      }
      createVaultInvitation(vaultId, inviterUser, invitedEmail, options) {
        this.ensureJointVaultsArrays();
        const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
        if (!vault) throw new Error("Vault not found");
        if (!vault.memberUids.includes(inviterUser.id)) throw new Error("Unauthorized: only vault members can invite");
        if (vault.memberUids.length >= 2) throw new Error("Vault already has maximum members (2)");
        const now = /* @__PURE__ */ new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1e3).toISOString();
        const inviteCode = options?.inviteCode || crypto.randomBytes(6).toString("hex").toUpperCase();
        const invitation = {
          id: options?.id || `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          vaultId,
          vaultName: vault.name,
          invitedByUid: inviterUser.id,
          invitedByName: inviterUser.name || "Vault Partner",
          inviteCode,
          invitedEmail: invitedEmail ? invitedEmail.trim() : void 0,
          status: "pending",
          createdAt: now.toISOString(),
          expiresAt
        };
        this.db.vaultInvitations.push(invitation);
        this.save();
        return invitation;
      }
      acceptVaultInvitation(inviteCode, user) {
        this.ensureJointVaultsArrays();
        const code = inviteCode.trim().toUpperCase();
        const allInvitations = this.db.vaultInvitations || [];
        const codeMatches = allInvitations.filter((inv) => inv.inviteCode === code);
        if (codeMatches.length === 0) {
          throw new Error("Invalid invitation code. Please verify the code and retry.");
        }
        const invitation = codeMatches[codeMatches.length - 1];
        const vault = (this.db.jointVaults || []).find((v) => v.id === invitation.vaultId);
        if (invitation.status === "accepted") {
          if (vault && vault.memberUids.includes(user.id) && invitation.acceptedByUid === user.id) {
            return { vault, invitation };
          }
          throw new Error("Invalid or already processed invitation code");
        }
        if (invitation.status === "revoked") {
          throw new Error("This invitation code has been revoked. Please ask your partner to generate a new code.");
        }
        if (invitation.status === "expired" || new Date(invitation.expiresAt) <= /* @__PURE__ */ new Date()) {
          invitation.status = "expired";
          this.save();
          throw new Error("This invitation code has expired. Please ask your partner to generate a new one.");
        }
        if (invitation.status !== "pending") {
          throw new Error("This invitation code is no longer valid.");
        }
        if (!vault || vault.status !== "active") throw new Error("Target vault not found or archived");
        if (invitation.invitedEmail) {
          const normalizedInvited = invitation.invitedEmail.trim().toLowerCase();
          const normalizedUser = (user.email || "").trim().toLowerCase();
          if (!normalizedUser || normalizedInvited !== normalizedUser) {
            throw new Error("This invitation was sent to a different email address.");
          }
        }
        if (vault.memberUids.includes(user.id)) {
          throw new Error("You are already a member of this vault");
        }
        if (vault.memberUids.length >= 2) {
          throw new Error("Vault already has the maximum of 2 active members");
        }
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        invitation.status = "accepted";
        invitation.acceptedByUid = user.id;
        invitation.acceptedAt = nowIso;
        vault.memberUids.push(user.id);
        vault.targetRatio = {
          [vault.createdBy]: 50,
          [user.id]: 50
        };
        vault.updatedAt = nowIso;
        const newMember = {
          uid: user.id,
          email: user.email || `${user.id}@focusflow.app`,
          name: user.name || "Partner",
          role: "partner",
          status: "active",
          joinedAt: nowIso
        };
        this.db.vaultMembers.push(newMember);
        const activity = {
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          vaultId: vault.id,
          actorUid: user.id,
          actorName: newMember.name,
          type: "member_joined",
          title: "Partner Joined Vault",
          description: `${newMember.name} joined "${vault.name}"`,
          timestamp: nowIso
        };
        this.db.vaultActivities.push(activity);
        this.save();
        return { vault, invitation };
      }
      rejectVaultInvitation(inviteCode, user) {
        this.ensureJointVaultsArrays();
        const code = inviteCode.trim().toUpperCase();
        const invitation = (this.db.vaultInvitations || []).find(
          (inv) => inv.inviteCode === code && inv.status === "pending"
        );
        if (!invitation) throw new Error("Invalid or already processed invitation");
        if (invitation.invitedEmail) {
          const email = typeof user === "object" ? user.email : void 0;
          const normalizedInvited = invitation.invitedEmail.trim().toLowerCase();
          const normalizedUser = (email || "").trim().toLowerCase();
          if (!normalizedUser || normalizedInvited !== normalizedUser) {
            throw new Error("This invitation was sent to a different email address.");
          }
        }
        invitation.status = "rejected";
        this.save();
        return invitation;
      }
      revokeVaultInvitation(vaultId, inviteId, userId) {
        this.ensureJointVaultsArrays();
        const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
        if (!vault || !vault.memberUids.includes(userId)) return false;
        const invitation = (this.db.vaultInvitations || []).find(
          (inv) => inv.id === inviteId && inv.vaultId === vaultId
        );
        if (!invitation || invitation.status !== "pending") return false;
        invitation.status = "revoked";
        this.save();
        return true;
      }
      addVaultContribution(vaultId, user, data) {
        this.ensureJointVaultsArrays();
        const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
        if (!vault) throw new Error("Vault not found");
        if (!vault.memberUids.includes(user.id)) throw new Error("Unauthorized: only vault members can contribute");
        if (vault.status !== "active") throw new Error("Cannot contribute to an archived vault");
        if (!data.amountPaise || !Number.isInteger(data.amountPaise) || data.amountPaise <= 0) {
          throw new Error("Contribution amount must be a positive integer in paise");
        }
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const contribution = {
          id: `vcb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          vaultId,
          contributedByUid: user.id,
          contributorName: user.name || "Member",
          amountPaise: data.amountPaise,
          date: data.date || getTodayDateString(DEFAULT_TIMEZONE),
          description: (data.description || "Shared savings contribution").trim(),
          createdAt: nowIso,
          status: "active"
        };
        this.db.vaultContributions.push(contribution);
        const activeContribs = (this.db.vaultContributions || []).filter(
          (c) => c.vaultId === vaultId && c.status === "active"
        );
        const totalContributed = activeContribs.reduce((acc, c) => acc + c.amountPaise, 0);
        for (const pct of [25, 50, 75, 100]) {
          const milestoneTarget = Math.floor(vault.targetPaise * pct / 100);
          const alreadyLogged = (this.db.vaultActivities || []).some(
            (a) => a.vaultId === vaultId && a.type === "milestone_achieved" && a.metadata?.percent === pct
          );
          if (!alreadyLogged && totalContributed >= milestoneTarget) {
            this.db.vaultActivities.push({
              id: `act_milestone_${vaultId}_${pct}_${Date.now()}`,
              vaultId,
              actorUid: user.id,
              actorName: user.name || "Member",
              type: "milestone_achieved",
              title: `${pct}% Milestone Reached!`,
              description: `The vault "${vault.name}" reached ${pct}% of its savings goal!`,
              amountPaise: totalContributed,
              timestamp: nowIso,
              metadata: { percent: pct, targetPaise: milestoneTarget }
            });
          }
        }
        this.db.vaultActivities.push({
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          vaultId,
          actorUid: user.id,
          actorName: user.name || "Member",
          type: "contribution_added",
          title: "Contribution Added",
          description: `${user.name || "Member"} contributed ${formatCurrency(contribution.amountPaise, vault.currency)}`,
          amountPaise: contribution.amountPaise,
          timestamp: nowIso
        });
        vault.updatedAt = nowIso;
        this.save();
        return contribution;
      }
      reverseVaultContribution(vaultId, contributionId, userId, reason) {
        this.ensureJointVaultsArrays();
        const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
        if (!vault || !vault.memberUids.includes(userId)) throw new Error("Unauthorized");
        const contribution = (this.db.vaultContributions || []).find(
          (c) => c.id === contributionId && c.vaultId === vaultId
        );
        if (!contribution) throw new Error("Contribution not found");
        if (contribution.status !== "active") throw new Error("Contribution is already reversed");
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        contribution.status = "reversed";
        contribution.reversedAt = nowIso;
        contribution.reversedByUid = userId;
        contribution.reversalReason = reason ? reason.trim() : "Manual reversal";
        this.db.vaultActivities.push({
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          vaultId,
          actorUid: userId,
          actorName: "Member",
          type: "contribution_reversed",
          title: "Contribution Reversed",
          description: `Contribution of ${formatCurrency(contribution.amountPaise, vault.currency)} was reversed: ${contribution.reversalReason}`,
          amountPaise: contribution.amountPaise,
          timestamp: nowIso
        });
        vault.updatedAt = nowIso;
        this.save();
        return contribution;
      }
      addVaultExpense(vaultId, user, data) {
        this.ensureJointVaultsArrays();
        const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
        if (!vault) throw new Error("Vault not found");
        if (!vault.memberUids.includes(user.id)) throw new Error("Unauthorized");
        if (vault.memberUids.length < 2) throw new Error("Joint expenses require 2 active members");
        if (!data.amountPaise || !Number.isInteger(data.amountPaise) || data.amountPaise <= 0) {
          throw new Error("Expense amount must be a positive integer in paise");
        }
        const uidA = vault.memberUids[0];
        const uidB = vault.memberUids[1];
        const ratioA = vault.targetRatio[uidA] ?? 50;
        const splitMode = data.splitMode || "equal";
        const memberShares = splitExpense(data.amountPaise, splitMode, uidA, uidB, ratioA, data.customShares);
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const expense = {
          id: `vex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          vaultId,
          paidByUid: user.id,
          payerName: user.name || "Member",
          amountPaise: data.amountPaise,
          description: data.description.trim(),
          date: data.date || getTodayDateString(DEFAULT_TIMEZONE),
          splitMode,
          memberShares,
          createdAt: nowIso,
          status: "active"
        };
        this.db.vaultExpenses.push(expense);
        this.db.vaultActivities.push({
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          vaultId,
          actorUid: user.id,
          actorName: user.name || "Member",
          type: "expense_added",
          title: "Joint Expense Recorded",
          description: `${user.name || "Member"} paid ${formatCurrency(expense.amountPaise, vault.currency)} for "${expense.description}"`,
          amountPaise: expense.amountPaise,
          timestamp: nowIso
        });
        vault.updatedAt = nowIso;
        this.save();
        return expense;
      }
      reverseVaultExpense(vaultId, expenseId, userId) {
        this.ensureJointVaultsArrays();
        const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
        if (!vault || !vault.memberUids.includes(userId)) throw new Error("Unauthorized");
        const expense = (this.db.vaultExpenses || []).find((e) => e.id === expenseId && e.vaultId === vaultId);
        if (!expense) throw new Error("Expense not found");
        if (expense.status !== "active") throw new Error("Expense is already reversed");
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        expense.status = "reversed";
        expense.reversedAt = nowIso;
        expense.reversedByUid = userId;
        this.db.vaultActivities.push({
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          vaultId,
          actorUid: userId,
          actorName: "Member",
          type: "expense_reversed",
          title: "Joint Expense Reversed",
          description: `Expense "${expense.description}" of ${formatCurrency(expense.amountPaise, vault.currency)} was reversed`,
          amountPaise: expense.amountPaise,
          timestamp: nowIso
        });
        vault.updatedAt = nowIso;
        this.save();
        return expense;
      }
      recordVaultSettlement(vaultId, fromUser, data) {
        this.ensureJointVaultsArrays();
        const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
        if (!vault) throw new Error("Vault not found");
        if (!vault.memberUids.includes(fromUser.id)) throw new Error("Unauthorized");
        if (!vault.memberUids.includes(data.toUid)) throw new Error("Recipient must be a vault member");
        if (!data.amountPaise || !Number.isInteger(data.amountPaise) || data.amountPaise <= 0) {
          throw new Error("Settlement amount must be a positive integer in paise");
        }
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const settlement = {
          id: `vstl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          vaultId,
          fromUid: fromUser.id,
          fromName: fromUser.name || "Member",
          toUid: data.toUid,
          toName: data.toName || "Partner",
          amountPaise: data.amountPaise,
          date: data.date || getTodayDateString(DEFAULT_TIMEZONE),
          notes: (data.notes || "Settlement payment").trim(),
          createdAt: nowIso
        };
        this.db.vaultSettlements.push(settlement);
        this.db.vaultActivities.push({
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          vaultId,
          actorUid: fromUser.id,
          actorName: fromUser.name || "Member",
          type: "settlement_recorded",
          title: "Settlement Payment Recorded",
          description: `${settlement.fromName} paid ${formatCurrency(settlement.amountPaise, vault.currency)} to ${settlement.toName}`,
          amountPaise: settlement.amountPaise,
          timestamp: nowIso
        });
        vault.updatedAt = nowIso;
        this.save();
        return settlement;
      }
      updateVaultRatio(vaultId, userId, targetRatio) {
        this.ensureJointVaultsArrays();
        const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
        if (!vault || !vault.memberUids.includes(userId)) throw new Error("Unauthorized");
        if (!isValidRatio(targetRatio, vault.memberUids)) {
          throw new Error("Invalid target ratio: must be positive integers summing to 100 for all vault members");
        }
        vault.targetRatio = targetRatio;
        vault.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.db.vaultActivities.push({
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          vaultId,
          actorUid: userId,
          actorName: "Member",
          type: "ratio_updated",
          title: "Contribution Ratio Updated",
          description: `Target ratio updated to ${Object.values(targetRatio).join("/")}`,
          timestamp: vault.updatedAt
        });
        this.save();
        return vault;
      }
      leaveVault(vaultId, userId) {
        this.ensureJointVaultsArrays();
        const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
        if (!vault || !vault.memberUids.includes(userId)) return false;
        if (vault.memberUids.length <= 1) {
          throw new Error("Single remaining member cannot leave vault. Please archive the vault instead.");
        }
        const member = (this.db.vaultMembers || []).find((m) => m.uid === userId);
        if (member) {
          member.status = "left";
        }
        vault.memberUids = vault.memberUids.filter((id) => id !== userId);
        vault.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.db.vaultActivities.push({
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          vaultId,
          actorUid: userId,
          actorName: member?.name || "Partner",
          type: "member_left",
          title: "Member Left Vault",
          description: `${member?.name || "A member"} left the vault`,
          timestamp: vault.updatedAt
        });
        this.save();
        return true;
      }
      archiveVault(vaultId, userId) {
        this.ensureJointVaultsArrays();
        const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
        if (!vault || !vault.memberUids.includes(userId)) throw new Error("Unauthorized");
        vault.status = "archived";
        vault.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.db.vaultActivities.push({
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          vaultId,
          actorUid: userId,
          actorName: "Member",
          type: "vault_archived",
          title: "Vault Archived",
          description: `The vault "${vault.name}" was archived`,
          timestamp: vault.updatedAt
        });
        this.save();
        return vault;
      }
      // ==========================================
      // FocusFlow v1.8 Multi-Tenant Layer (Hardened)
      // ==========================================
      verifyNoCrossUserCollision(collection, id, userId, entityName) {
        if (!collection) return null;
        const existing = collection.find((item) => item.id === id);
        if (!existing) return null;
        if (!existing.userId || existing.userId !== userId) {
          throw new Error(`Forbidden: Cannot overwrite a ${entityName} owned by another user`);
        }
        return existing;
      }
      deleteOwnedRecord(collection, id, userId, entityName) {
        if (!collection || !id || !userId) return false;
        const existing = collection.find((item) => item.id === id);
        if (!existing) return false;
        if (!existing.userId || existing.userId !== userId) {
          throw new Error(`Forbidden: Cannot delete a ${entityName} owned by another user`);
        }
        const idx = collection.findIndex((item) => item.id === id && item.userId === userId);
        if (idx >= 0) {
          collection.splice(idx, 1);
          this.save();
          return true;
        }
        return false;
      }
      getOwnedRecord(collection, id, userId, entityName) {
        if (!collection || !id || !userId) return null;
        const existing = collection.find((item) => item.id === id);
        if (!existing) return null;
        if (!existing.userId || existing.userId !== userId) {
          throw new Error(`Forbidden: Access denied to a ${entityName} owned by another user`);
        }
        return existing;
      }
      findAnyRecordOwner(collectionName, id) {
        const col = this.db[collectionName];
        if (!Array.isArray(col)) return null;
        const found = col.find((item) => item.id === id);
        if (!found) return null;
        return { userId: found.userId };
      }
      // 1. Skill Nodes
      getSkillNodes(userId) {
        if (!userId || typeof userId !== "string" || userId.trim() === "") return [];
        return (this.db.skillNodes || []).filter((n) => typeof n.userId === "string" && n.userId.trim() !== "" && n.userId === userId);
      }
      getSkillNode(id, userId) {
        return this.getOwnedRecord(this.db.skillNodes, id, userId, "skill node");
      }
      saveSkillNode(node) {
        this.db.skillNodes = this.db.skillNodes || [];
        if (!node.userId) {
          throw new Error("Forbidden: Cannot save a skill node without userId");
        }
        this.verifyNoCrossUserCollision(this.db.skillNodes, node.id, node.userId, "skill node");
        const idx = this.db.skillNodes.findIndex((n) => n.id === node.id && n.userId === node.userId);
        if (idx >= 0) {
          this.db.skillNodes[idx] = node;
        } else {
          this.db.skillNodes.push(node);
        }
        this.save();
        return node;
      }
      deleteSkillNode(id, userId) {
        return this.deleteOwnedRecord(this.db.skillNodes, id, userId, "skill node");
      }
      // 2. Whiteboard Drawings
      getWhiteboardDrawings(userId) {
        if (!userId || typeof userId !== "string" || userId.trim() === "") return [];
        return (this.db.whiteboardDrawings || []).filter((d) => typeof d.userId === "string" && d.userId.trim() !== "" && d.userId === userId);
      }
      getWhiteboardDrawing(id, userId) {
        return this.getOwnedRecord(this.db.whiteboardDrawings, id, userId, "whiteboard drawing");
      }
      saveWhiteboardDrawing(drawing) {
        this.db.whiteboardDrawings = this.db.whiteboardDrawings || [];
        this.verifyNoCrossUserCollision(this.db.whiteboardDrawings, drawing.id, drawing.userId, "whiteboard drawing");
        const idx = this.db.whiteboardDrawings.findIndex((d) => d.id === drawing.id && d.userId === drawing.userId);
        if (idx >= 0) {
          this.db.whiteboardDrawings[idx] = drawing;
        } else {
          this.db.whiteboardDrawings.push(drawing);
        }
        this.save();
        return drawing;
      }
      deleteWhiteboardDrawing(id, userId) {
        return this.deleteOwnedRecord(this.db.whiteboardDrawings, id, userId, "whiteboard drawing");
      }
      // 3. Exam Hall Simulations
      getExamSimulations(userId) {
        if (!userId || typeof userId !== "string" || userId.trim() === "") return [];
        return (this.db.examSimulations || []).filter((s) => typeof s.userId === "string" && s.userId.trim() !== "" && s.userId === userId);
      }
      getExamSimulation(id, userId) {
        return this.getOwnedRecord(this.db.examSimulations, id, userId, "exam simulation");
      }
      saveExamSimulation(sim) {
        this.db.examSimulations = this.db.examSimulations || [];
        if (!sim.userId) {
          throw new Error("Forbidden: Cannot save an exam simulation without userId");
        }
        this.verifyNoCrossUserCollision(this.db.examSimulations, sim.id, sim.userId, "exam simulation");
        const idx = this.db.examSimulations.findIndex((s) => s.id === sim.id && s.userId === sim.userId);
        if (idx >= 0) {
          this.db.examSimulations[idx] = sim;
        } else {
          this.db.examSimulations.push(sim);
        }
        this.save();
        return sim;
      }
      deleteExamSimulation(id, userId) {
        return this.deleteOwnedRecord(this.db.examSimulations, id, userId, "exam simulation");
      }
      // 4. Decision Journal
      getDecisionEntries(userId) {
        if (!userId || typeof userId !== "string" || userId.trim() === "") return [];
        return (this.db.decisionEntries || []).filter((d) => typeof d.userId === "string" && d.userId.trim() !== "" && d.userId === userId);
      }
      getDecisionEntry(id, userId) {
        return this.getOwnedRecord(this.db.decisionEntries, id, userId, "decision entry");
      }
      saveDecisionEntry(entry) {
        this.db.decisionEntries = this.db.decisionEntries || [];
        this.verifyNoCrossUserCollision(this.db.decisionEntries, entry.id, entry.userId, "decision entry");
        const idx = this.db.decisionEntries.findIndex((d) => d.id === entry.id && d.userId === entry.userId);
        if (idx >= 0) {
          this.db.decisionEntries[idx] = entry;
        } else {
          this.db.decisionEntries.unshift(entry);
        }
        this.save();
        return entry;
      }
      deleteDecisionEntry(id, userId) {
        return this.deleteOwnedRecord(this.db.decisionEntries, id, userId, "decision entry");
      }
      // 5. Doomscroll Tax Jar
      getDoomscrollLogs(userId) {
        if (!userId || typeof userId !== "string" || userId.trim() === "") return [];
        return (this.db.doomscrollLogs || []).filter((l) => typeof l.userId === "string" && l.userId.trim() !== "" && l.userId === userId);
      }
      getDoomscrollLog(id, userId) {
        return this.getOwnedRecord(this.db.doomscrollLogs, id, userId, "doomscroll log");
      }
      saveDoomscrollLog(entry) {
        this.db.doomscrollLogs = this.db.doomscrollLogs || [];
        this.verifyNoCrossUserCollision(this.db.doomscrollLogs, entry.id, entry.userId, "doomscroll log");
        const idx = this.db.doomscrollLogs.findIndex((l) => l.id === entry.id && l.userId === entry.userId);
        if (idx >= 0) {
          this.db.doomscrollLogs[idx] = entry;
        } else {
          this.db.doomscrollLogs.unshift(entry);
        }
        this.save();
        return entry;
      }
      deleteDoomscrollLog(id, userId) {
        return this.deleteOwnedRecord(this.db.doomscrollLogs, id, userId, "doomscroll log");
      }
      clearDoomscrollLogs(userId) {
        if (!userId) return false;
        this.db.doomscrollLogs = (this.db.doomscrollLogs || []).filter((l) => l.userId !== userId);
        this.save();
        return true;
      }
      // 6. Life Milestones
      getLifeMilestones(userId) {
        if (!userId || typeof userId !== "string" || userId.trim() === "") return [];
        return (this.db.lifeMilestones || []).filter((m) => typeof m.userId === "string" && m.userId.trim() !== "" && m.userId === userId);
      }
      getLifeMilestone(id, userId) {
        return this.getOwnedRecord(this.db.lifeMilestones, id, userId, "life milestone");
      }
      saveLifeMilestone(milestone) {
        this.db.lifeMilestones = this.db.lifeMilestones || [];
        this.verifyNoCrossUserCollision(this.db.lifeMilestones, milestone.id, milestone.userId, "life milestone");
        const idx = this.db.lifeMilestones.findIndex((m) => m.id === milestone.id && m.userId === milestone.userId);
        if (idx >= 0) {
          this.db.lifeMilestones[idx] = milestone;
        } else {
          this.db.lifeMilestones.push(milestone);
        }
        this.save();
        return milestone;
      }
      deleteLifeMilestone(id, userId) {
        return this.deleteOwnedRecord(this.db.lifeMilestones, id, userId, "life milestone");
      }
      // 7. Time Capsules
      getTimeCapsules(userId) {
        if (!userId || typeof userId !== "string" || userId.trim() === "") return [];
        return (this.db.timeCapsules || []).filter((c) => typeof c.userId === "string" && c.userId.trim() !== "" && c.userId === userId);
      }
      getTimeCapsule(id, userId) {
        return this.getOwnedRecord(this.db.timeCapsules, id, userId, "time capsule");
      }
      saveTimeCapsule(letter) {
        this.db.timeCapsules = this.db.timeCapsules || [];
        this.verifyNoCrossUserCollision(this.db.timeCapsules, letter.id, letter.userId, "time capsule");
        const idx = this.db.timeCapsules.findIndex((c) => c.id === letter.id && c.userId === letter.userId);
        if (idx >= 0) {
          this.db.timeCapsules[idx] = letter;
        } else {
          this.db.timeCapsules.unshift(letter);
        }
        this.save();
        return letter;
      }
      deleteTimeCapsule(id, userId) {
        return this.deleteOwnedRecord(this.db.timeCapsules, id, userId, "time capsule");
      }
      // 8. Emergency Profile
      getEmergencyProfile(userId) {
        if (!userId || typeof userId !== "string" || userId.trim() === "") return null;
        return (this.db.emergencyAssetProfiles || []).find((p) => p.userId === userId) || null;
      }
      saveEmergencyProfile(profile) {
        this.db.emergencyAssetProfiles = this.db.emergencyAssetProfiles || [];
        const existing = this.db.emergencyAssetProfiles.find((p) => p.id === profile.id || p.userId === profile.userId);
        if (existing && existing.userId !== profile.userId) {
          throw new Error("Forbidden: Cannot overwrite an emergency profile owned by another user");
        }
        const idx = this.db.emergencyAssetProfiles.findIndex((p) => p.userId === profile.userId);
        if (idx >= 0) {
          this.db.emergencyAssetProfiles[idx] = profile;
        } else {
          this.db.emergencyAssetProfiles.push(profile);
        }
        this.save();
        return profile;
      }
      deleteEmergencyProfile(userId) {
        if (!userId || !this.db.emergencyAssetProfiles) return false;
        const initialLen = this.db.emergencyAssetProfiles.length;
        this.db.emergencyAssetProfiles = this.db.emergencyAssetProfiles.filter((p) => p.userId !== userId);
        if (this.db.emergencyAssetProfiles.length !== initialLen) {
          this.save();
          return true;
        }
        return false;
      }
    };
    dbService = new DatabaseService();
  }
});

// server/vaultBackendService.ts
var vaultBackendService_exports = {};
__export(vaultBackendService_exports, {
  PRODUCTION_DATABASE_ID: () => PRODUCTION_DATABASE_ID,
  PRODUCTION_PROJECT_ID: () => PRODUCTION_PROJECT_ID,
  VaultBackendService: () => VaultBackendService,
  VaultServiceError: () => VaultServiceError,
  __setServiceAccountForTesting: () => __setServiceAccountForTesting,
  getGoogleOAuthAccessToken: () => getGoogleOAuthAccessToken,
  parseServiceAccountString: () => parseServiceAccountString,
  resolveFirestoreDatabaseId: () => resolveFirestoreDatabaseId,
  resolveProjectId: () => resolveProjectId,
  resolveServiceAccount: () => resolveServiceAccount,
  vaultBackendService: () => vaultBackendService
});
import crypto2 from "crypto";
import fs2 from "fs";
import path2 from "path";
function __setServiceAccountForTesting(sa) {
  testingOverrideServiceAccount = sa;
  cachedAccessToken = null;
  cachedServiceAccount = null;
}
function parseServiceAccountString(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    try {
      const cleanB64 = trimmed.replace(/\s+/g, "");
      const decoded = Buffer.from(cleanB64, "base64").toString("utf-8");
      parsed = JSON.parse(decoded);
    } catch {
      console.warn("[vaultBackendService] Failed to parse service account JSON from environment");
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const client_email = typeof parsed.client_email === "string" ? parsed.client_email.trim() : "";
  let private_key = typeof parsed.private_key === "string" ? parsed.private_key : "";
  const project_id = typeof parsed.project_id === "string" && parsed.project_id.trim() ? parsed.project_id.trim() : resolveFirebaseProjectIdFallback();
  if (!client_email || !private_key) {
    console.warn("[vaultBackendService] Service account JSON missing required fields (client_email or private_key)");
    return null;
  }
  if (private_key.includes("\\n")) {
    private_key = private_key.replace(/\\n/g, "\n");
  }
  return {
    client_email,
    private_key,
    project_id
  };
}
function resolveServiceAccount() {
  if (testingOverrideServiceAccount !== void 0) {
    return testingOverrideServiceAccount;
  }
  if (cachedServiceAccount) return cachedServiceAccount;
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    process.env.FIREBASE_SERVICE_ACCOUNT,
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    process.env.FIREBASE_ADMIN_CREDENTIALS,
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  ];
  for (const envVal of candidates) {
    const parsed = parseServiceAccountString(envVal);
    if (parsed) {
      cachedServiceAccount = parsed;
      return cachedServiceAccount;
    }
  }
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs2.existsSync(credPath)) {
    try {
      const raw = fs2.readFileSync(credPath, "utf-8");
      const parsed = parseServiceAccountString(raw);
      if (parsed) {
        cachedServiceAccount = parsed;
        return cachedServiceAccount;
      }
    } catch {
      console.warn("[vaultBackendService] Failed to read credentials file from GOOGLE_APPLICATION_CREDENTIALS");
    }
  }
  return null;
}
function resolveFirebaseProjectIdFallback() {
  const isVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
  const vercelEnv = (process.env.VERCEL_ENV || "").trim().toLowerCase();
  const appEnv = (process.env.APP_ENV || process.env.VITE_APP_ENV || "").trim().toLowerCase();
  const nodeEnv = (process.env.NODE_ENV || "").trim().toLowerCase();
  const backendProjId = process.env.FIREBASE_PROJECT_ID;
  const frontendProjId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (backendProjId && frontendProjId && backendProjId !== frontendProjId) {
    throw new Error(
      `[CONFIG_DISAGREEMENT] Backend FIREBASE_PROJECT_ID (${backendProjId}) does not match frontend VITE_FIREBASE_PROJECT_ID (${frontendProjId})`
    );
  }
  const explicitProjId = backendProjId || frontendProjId;
  if (vercelEnv && appEnv) {
    if (vercelEnv === "preview" && appEnv === "production") {
      throw new Error(
        "[CONFIG_CONFLICT] Vercel environment ('preview') conflicts with APP_ENV ('production'). Preview deployment cannot be overridden to production."
      );
    }
    if (vercelEnv === "production" && appEnv === "preview") {
      throw new Error(
        "[CONFIG_CONFLICT] Vercel environment ('production') conflicts with APP_ENV ('preview'). Conflicting environment flags are strictly forbidden."
      );
    }
  }
  if (isVercel) {
    if (!vercelEnv || vercelEnv !== "production" && vercelEnv !== "preview" && vercelEnv !== "development") {
      throw new Error(
        `[VERCEL_ENVIRONMENT_UNRECOGNIZED] Running on Vercel deployment but VERCEL_ENV is missing or unrecognized ('${vercelEnv}'). Cannot safely determine deployment tier.`
      );
    }
    if (vercelEnv === "preview") {
      if (!explicitProjId) {
        throw new Error(
          "[PREVIEW_STAGING_CONFIG_MISSING] Vercel Preview requires explicit Staging FIREBASE_PROJECT_ID or VITE_FIREBASE_PROJECT_ID. Automatic fallback to Production Firebase is blocked."
        );
      }
      if (explicitProjId === PRODUCTION_PROJECT_ID || explicitProjId === "focus-flow-by-atif" || explicitProjId === "seismic-codex-m01dl" || explicitProjId === "gen-lang-client-0390447756") {
        throw new Error(
          `[STAGING_DATA_SAFETY_VIOLATION] Preview deployment cannot use Production Firebase Project (${explicitProjId}). Preview must use a dedicated Staging Firebase Project.`
        );
      }
      return explicitProjId;
    }
    if (vercelEnv === "production") {
      if (explicitProjId) return explicitProjId;
      return PRODUCTION_PROJECT_ID;
    }
    if (vercelEnv === "development" && explicitProjId) {
      return explicitProjId;
    }
  }
  if (appEnv === "preview") {
    if (!explicitProjId) {
      throw new Error(
        "[PREVIEW_STAGING_CONFIG_MISSING] Preview requires explicit Staging FIREBASE_PROJECT_ID or VITE_FIREBASE_PROJECT_ID. Automatic fallback to Production Firebase is blocked."
      );
    }
    if (explicitProjId === PRODUCTION_PROJECT_ID || explicitProjId === "focus-flow-by-atif" || explicitProjId === "seismic-codex-m01dl" || explicitProjId === "gen-lang-client-0390447756") {
      throw new Error(
        `[STAGING_DATA_SAFETY_VIOLATION] Preview deployment cannot use Production Firebase Project (${explicitProjId}). Preview must use a dedicated Staging Firebase Project.`
      );
    }
    return explicitProjId;
  }
  if (explicitProjId) return explicitProjId;
  if (nodeEnv === "test") return "test-rules-project";
  try {
    const cfgPath = path2.resolve(process.cwd(), "firebase-applet-config.json");
    if (fs2.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs2.readFileSync(cfgPath, "utf-8"));
      if (parsed.projectId) return parsed.projectId;
    }
  } catch {
  }
  return PRODUCTION_PROJECT_ID;
}
function resolveFirestoreDatabaseId() {
  const isVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
  const vercelEnv = (process.env.VERCEL_ENV || "").trim().toLowerCase();
  const appEnv = (process.env.APP_ENV || process.env.VITE_APP_ENV || "").trim().toLowerCase();
  const explicitDb = process.env.VITE_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID;
  if (isVercel) {
    if (!vercelEnv || vercelEnv !== "production" && vercelEnv !== "preview" && vercelEnv !== "development") {
      throw new Error(
        `[VERCEL_ENVIRONMENT_UNRECOGNIZED] Running on Vercel deployment but VERCEL_ENV is missing or unrecognized ('${vercelEnv}'). Cannot safely determine deployment tier.`
      );
    }
    if (vercelEnv === "preview") {
      if (!explicitDb) {
        throw new Error(
          "[PREVIEW_STAGING_CONFIG_MISSING] Vercel Preview requires explicit Staging VITE_FIREBASE_DATABASE_ID. Automatic fallback to Production Firestore Database is blocked."
        );
      }
      if (explicitDb === PRODUCTION_DATABASE_ID) {
        throw new Error(
          `[STAGING_DATA_SAFETY_VIOLATION] Preview deployment cannot use Production Firestore Database (${PRODUCTION_DATABASE_ID}). Preview must use a dedicated Staging Firestore Database.`
        );
      }
      return explicitDb;
    }
    if (vercelEnv === "production") {
      if (explicitDb) return explicitDb;
      return PRODUCTION_DATABASE_ID;
    }
    if (vercelEnv === "development" && explicitDb) {
      return explicitDb;
    }
  }
  if (appEnv === "preview") {
    if (!explicitDb) {
      throw new Error(
        "[PREVIEW_STAGING_CONFIG_MISSING] Preview requires explicit Staging VITE_FIREBASE_DATABASE_ID. Automatic fallback to Production Firestore Database is blocked."
      );
    }
    if (explicitDb === PRODUCTION_DATABASE_ID) {
      throw new Error(
        `[STAGING_DATA_SAFETY_VIOLATION] Preview deployment cannot use Production Firestore Database (${PRODUCTION_DATABASE_ID}). Preview must use a dedicated Staging Firestore Database.`
      );
    }
    return explicitDb;
  }
  if (explicitDb) {
    return explicitDb;
  }
  try {
    const cfgPath = path2.resolve(process.cwd(), "firebase-applet-config.json");
    if (fs2.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs2.readFileSync(cfgPath, "utf-8"));
      if (parsed.firestoreDatabaseId) return parsed.firestoreDatabaseId;
    }
  } catch {
  }
  return PRODUCTION_DATABASE_ID;
}
function resolveProjectId(serviceAccount) {
  if (serviceAccount?.project_id) return serviceAccount.project_id;
  return resolveFirebaseProjectIdFallback();
}
async function getGoogleOAuthAccessToken(sa) {
  const now = Math.floor(Date.now() / 1e3);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 300) {
    return cachedAccessToken.token;
  }
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/datastore",
    iat: now,
    exp: now + 3600
  };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const unsignedToken = `${headerB64}.${payloadB64}`;
  const signer = crypto2.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(sa.private_key, "base64url");
  const assertion = `${unsignedToken}.${signature}`;
  const params = new URLSearchParams();
  params.append("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  params.append("assertion", assertion);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to exchange service account JWT for access token: ${res.status} ${text}`);
  }
  const data = await res.json();
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600)
  };
  return cachedAccessToken.token;
}
function fromFirestoreValue(val) {
  if (!val || typeof val !== "object") return val;
  if ("stringValue" in val) return val.stringValue;
  if ("integerValue" in val) return parseInt(val.integerValue, 10);
  if ("doubleValue" in val) return val.doubleValue;
  if ("booleanValue" in val) return val.booleanValue;
  if ("nullValue" in val) return null;
  if ("arrayValue" in val) {
    return (val.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ("mapValue" in val) {
    const res = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      res[k] = fromFirestoreValue(v);
    }
    return res;
  }
  return val;
}
function fromFirestoreDoc(doc) {
  const fields = doc.fields || {};
  const res = {};
  for (const [k, v] of Object.entries(fields)) {
    res[k] = fromFirestoreValue(v);
  }
  return res;
}
function toFirestoreValue(val) {
  if (val === null || val === void 0) return { nullValue: null };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== void 0) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}
async function beginFirestoreTransaction(token, baseUrl) {
  const res = await fetch(`${baseUrl}:beginTransaction`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ options: { readWrite: {} } })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to begin Firestore transaction (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.transaction;
}
async function rollbackFirestoreTransaction(token, baseUrl, transactionId) {
  try {
    await fetch(`${baseUrl}:rollback`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ transaction: transactionId })
    });
  } catch {
  }
}
async function commitFirestoreTransaction(token, baseUrl, transactionId, writes) {
  const res = await fetch(`${baseUrl}:commit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      transaction: transactionId,
      writes
    })
  });
  if (!res.ok) {
    const text = await res.text();
    const isAborted = res.status === 409 || text.includes("ABORTED") || text.includes("aborted");
    const err = new VaultServiceError(
      isAborted ? "Transaction was aborted due to concurrent modification. Please retry." : `Firestore transaction commit failed (${res.status}): ${text}`,
      isAborted ? 409 : res.status,
      isAborted ? "CONCURRENT_MODIFICATION" : "TRANSACTION_COMMIT_FAILED"
    );
    throw err;
  }
  return await res.json();
}
var VaultServiceError, cachedServiceAccount, cachedAccessToken, testingOverrideServiceAccount, PRODUCTION_PROJECT_ID, PRODUCTION_DATABASE_ID, VaultBackendService, vaultBackendService;
var init_vaultBackendService = __esm({
  "server/vaultBackendService.ts"() {
    init_db();
    init_vaultIntelligence();
    VaultServiceError = class extends Error {
      constructor(message, status = 400, code = "VAULT_ERROR") {
        super(message);
        this.name = "VaultServiceError";
        this.status = status;
        this.code = code;
      }
    };
    cachedServiceAccount = null;
    cachedAccessToken = null;
    testingOverrideServiceAccount = void 0;
    PRODUCTION_PROJECT_ID = "focus-flow-by-atif";
    PRODUCTION_DATABASE_ID = "(default)";
    VaultBackendService = class {
      isFirestoreConfigured() {
        return resolveServiceAccount() !== null;
      }
      ensureConfigured(isGuest) {
        const sa = resolveServiceAccount();
        if (!sa) {
          if (isGuest) {
            throw new Error("Local database mode");
          }
          throw new VaultServiceError(
            "Firebase Admin credentials are not configured on the server. Please configure FIREBASE_SERVICE_ACCOUNT in your environment to enable Joint Vault operations.",
            503,
            "FIREBASE_ADMIN_NOT_CONFIGURED"
          );
        }
        return sa;
      }
      /**
       * Accepts a vault invitation transactionally.
       * Guarantees strict single-use, idempotency, email validation, and capacity enforcement.
       */
      async acceptVaultInvitation(inviteCode, user) {
        const code = (inviteCode || "").trim().toUpperCase();
        if (!code) {
          throw new VaultServiceError("Invite code is required", 400, "INVALID_CODE");
        }
        if (user.isGuest) {
          return dbService.acceptVaultInvitation(code, user);
        }
        const sa = this.ensureConfigured(user.isGuest);
        const token = await getGoogleOAuthAccessToken(sa);
        const projectId = resolveProjectId(sa);
        const databaseId = resolveFirestoreDatabaseId();
        const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
        let attempts = 0;
        while (attempts < 2) {
          attempts++;
          let txId = "";
          try {
            txId = await beginFirestoreTransaction(token, baseUrl);
            const queryUrl = `${baseUrl}:runQuery`;
            const queryBody = {
              transaction: txId,
              structuredQuery: {
                from: [{ collectionId: "invitations", allDescendants: true }],
                where: {
                  fieldFilter: {
                    field: { fieldPath: "inviteCode" },
                    op: "EQUAL",
                    value: { stringValue: code }
                  }
                },
                limit: 1
              }
            };
            const queryRes = await fetch(queryUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify(queryBody)
            });
            if (!queryRes.ok) {
              const errText = await queryRes.text();
              throw new VaultServiceError(`Firestore query failed (${queryRes.status}): ${errText}`, 500);
            }
            const queryResults = await queryRes.json();
            const firstResult = queryResults.find((r) => r.document);
            if (!firstResult || !firstResult.document) {
              await rollbackFirestoreTransaction(token, baseUrl, txId);
              throw new VaultServiceError("Invalid invitation code. Please verify the code and retry.", 400, "INVALID_CODE");
            }
            const inviteDoc = firstResult.document;
            const inviteData = fromFirestoreDoc(inviteDoc);
            const invitePath = inviteDoc.name;
            const pathMatch = invitePath.match(/documents\/sharedVaults\/([^/]+)\/invitations\/([^/]+)$/);
            if (!pathMatch) {
              await rollbackFirestoreTransaction(token, baseUrl, txId);
              throw new VaultServiceError("Malformed invitation document path", 500);
            }
            const vaultId = pathMatch[1];
            const vaultRes = await fetch(`${baseUrl}/sharedVaults/${vaultId}?transaction=${encodeURIComponent(txId)}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (!vaultRes.ok) {
              await rollbackFirestoreTransaction(token, baseUrl, txId);
              throw new VaultServiceError("Target vault not found or inaccessible", 404, "VAULT_NOT_FOUND");
            }
            const vaultDoc = await vaultRes.json();
            const vaultData = fromFirestoreDoc(vaultDoc);
            if (inviteData.status === "accepted") {
              const currentMembers2 = Array.isArray(vaultData.memberUids) ? vaultData.memberUids : [];
              if (currentMembers2.includes(user.id) && inviteData.acceptedByUid === user.id) {
                await rollbackFirestoreTransaction(token, baseUrl, txId);
                return { vault: vaultData, invitation: inviteData };
              }
              await rollbackFirestoreTransaction(token, baseUrl, txId);
              throw new VaultServiceError("This invitation code has already been used and is no longer valid.", 400, "INVITATION_ALREADY_USED");
            }
            if (inviteData.status === "revoked") {
              await rollbackFirestoreTransaction(token, baseUrl, txId);
              throw new VaultServiceError("This invitation code has been revoked. Please ask your partner to generate a new code.", 400, "INVITATION_REVOKED");
            }
            if (inviteData.status !== "pending") {
              await rollbackFirestoreTransaction(token, baseUrl, txId);
              throw new VaultServiceError("This invitation code is no longer valid.", 400, "INVITATION_INVALID");
            }
            const now = /* @__PURE__ */ new Date();
            if (inviteData.expiresAt && new Date(inviteData.expiresAt) <= now) {
              await rollbackFirestoreTransaction(token, baseUrl, txId);
              throw new VaultServiceError("This invitation code has expired. Please ask your partner to generate a new one.", 400, "INVITATION_EXPIRED");
            }
            if (inviteData.invitedEmail) {
              const normalizedInvited = inviteData.invitedEmail.trim().toLowerCase();
              const normalizedUser = (user.email || "").trim().toLowerCase();
              if (!normalizedUser || normalizedInvited !== normalizedUser) {
                await rollbackFirestoreTransaction(token, baseUrl, txId);
                throw new VaultServiceError("This invitation was sent to a different email address.", 400, "EMAIL_MISMATCH");
              }
            }
            if (vaultData.status !== "active") {
              await rollbackFirestoreTransaction(token, baseUrl, txId);
              throw new VaultServiceError("Target vault not found or archived", 400, "VAULT_INACTIVE");
            }
            const currentMembers = Array.isArray(vaultData.memberUids) ? vaultData.memberUids : [];
            if (currentMembers.includes(user.id)) {
              await rollbackFirestoreTransaction(token, baseUrl, txId);
              throw new VaultServiceError("You are already an active member of this vault.", 400, "ALREADY_MEMBER");
            }
            if (currentMembers.length >= 2) {
              await rollbackFirestoreTransaction(token, baseUrl, txId);
              throw new VaultServiceError("This vault already has the maximum of 2 active partners.", 400, "VAULT_FULL");
            }
            const nowIso = now.toISOString();
            const updatedMembers = [...currentMembers, user.id];
            const updatedRatio = {
              [vaultData.createdBy]: 50,
              [user.id]: 50
            };
            const newMember = {
              uid: user.id,
              email: user.email || `${user.id}@focusflow.app`,
              name: user.name || "Partner",
              role: "partner",
              status: "active",
              joinedAt: nowIso
            };
            const activityId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const activity = {
              id: activityId,
              vaultId,
              actorUid: user.id,
              actorName: newMember.name,
              type: "member_joined",
              title: "Partner Joined Vault",
              description: `${newMember.name} joined "${vaultData.name}"`,
              timestamp: nowIso
            };
            const writes = [
              // 1. Update Vault root document
              {
                update: {
                  name: vaultDoc.name,
                  fields: {
                    ...vaultDoc.fields,
                    memberUids: toFirestoreValue(updatedMembers),
                    targetRatio: toFirestoreValue(updatedRatio),
                    updatedAt: { stringValue: nowIso }
                  }
                },
                updateMask: { fieldPaths: ["memberUids", "targetRatio", "updatedAt"] }
              },
              // 2. Update Invitation status
              {
                update: {
                  name: invitePath,
                  fields: {
                    ...inviteDoc.fields,
                    status: { stringValue: "accepted" },
                    acceptedByUid: { stringValue: user.id },
                    acceptedAt: { stringValue: nowIso },
                    updatedAt: { stringValue: nowIso }
                  }
                },
                updateMask: { fieldPaths: ["status", "acceptedByUid", "acceptedAt", "updatedAt"] }
              },
              // 3. Create Member subcollection doc
              {
                update: {
                  name: `${baseUrl}/sharedVaults/${vaultId}/members/${user.id}`,
                  fields: {
                    uid: { stringValue: newMember.uid },
                    email: { stringValue: newMember.email },
                    name: { stringValue: newMember.name },
                    role: { stringValue: newMember.role },
                    status: { stringValue: newMember.status },
                    joinedAt: { stringValue: newMember.joinedAt }
                  }
                }
              },
              // 4. Create Activity subcollection doc
              {
                update: {
                  name: `${baseUrl}/sharedVaults/${vaultId}/activity/${activityId}`,
                  fields: {
                    id: { stringValue: activity.id },
                    vaultId: { stringValue: activity.vaultId },
                    actorUid: { stringValue: activity.actorUid },
                    actorName: { stringValue: activity.actorName },
                    type: { stringValue: activity.type },
                    title: { stringValue: activity.title },
                    description: { stringValue: activity.description },
                    timestamp: { stringValue: activity.timestamp }
                  }
                }
              }
            ];
            await commitFirestoreTransaction(token, baseUrl, txId, writes);
            const updatedVault = {
              ...vaultData,
              memberUids: updatedMembers,
              targetRatio: updatedRatio,
              updatedAt: nowIso
            };
            const updatedInvite = {
              ...inviteData,
              status: "accepted",
              acceptedByUid: user.id,
              acceptedAt: nowIso
            };
            return { vault: updatedVault, invitation: updatedInvite };
          } catch (err) {
            if (err?.code === "CONCURRENT_MODIFICATION" && attempts < 2) {
              await new Promise((r) => setTimeout(r, 50 + Math.random() * 50));
              continue;
            }
            if (txId) {
              await rollbackFirestoreTransaction(token, baseUrl, txId);
            }
            throw err;
          }
        }
        throw new VaultServiceError("Concurrent modification detected. Please retry.", 409, "CONCURRENT_MODIFICATION");
      }
      /**
       * Leaves a vault transactionally.
       * If user is the only member, returns HTTP 409 LAST_MEMBER_MUST_ARCHIVE.
       * When >1 members exist, marks member as 'left', updates memberUids, preserves all historical financial data.
       */
      async leaveVault(vaultId, user) {
        if (user.isGuest) {
          try {
            const success = dbService.leaveVault(vaultId, user.id);
            const vault = dbService.getVaultSummary(vaultId, user.id)?.vault;
            return { success, vaultId, remainingMembers: vault?.memberUids || [] };
          } catch (err) {
            if (String(err?.message || "").toLowerCase().includes("archive")) {
              throw new VaultServiceError(
                err.message || "Single remaining member cannot leave vault. Please archive the vault instead.",
                409,
                "LAST_MEMBER_MUST_ARCHIVE"
              );
            }
            throw err;
          }
        }
        const sa = this.ensureConfigured(user.isGuest);
        const token = await getGoogleOAuthAccessToken(sa);
        const projectId = resolveProjectId(sa);
        const databaseId = resolveFirestoreDatabaseId();
        const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
        let txId = "";
        try {
          txId = await beginFirestoreTransaction(token, baseUrl);
          const vaultRes = await fetch(`${baseUrl}/sharedVaults/${vaultId}?transaction=${encodeURIComponent(txId)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!vaultRes.ok) {
            await rollbackFirestoreTransaction(token, baseUrl, txId);
            throw new VaultServiceError("Vault not found or access denied", 404, "VAULT_NOT_FOUND");
          }
          const vaultDoc = await vaultRes.json();
          const vaultData = fromFirestoreDoc(vaultDoc);
          const currentMembers = Array.isArray(vaultData.memberUids) ? vaultData.memberUids : [];
          if (!currentMembers.includes(user.id)) {
            await rollbackFirestoreTransaction(token, baseUrl, txId);
            throw new VaultServiceError("User is not an active member of this vault", 403, "NOT_A_MEMBER");
          }
          if (currentMembers.length <= 1) {
            await rollbackFirestoreTransaction(token, baseUrl, txId);
            throw new VaultServiceError(
              "Single remaining member cannot leave vault. Please archive the vault instead.",
              409,
              "LAST_MEMBER_MUST_ARCHIVE"
            );
          }
          const remainingMembers = currentMembers.filter((uid) => uid !== user.id);
          const nowIso = (/* @__PURE__ */ new Date()).toISOString();
          const updatedRatio = { [remainingMembers[0]]: 100 };
          const activityId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const activity = {
            id: activityId,
            vaultId,
            actorUid: user.id,
            actorName: user.name || "Member",
            type: "member_left",
            title: "Member Left Vault",
            description: `${user.name || "Member"} left the vault`,
            timestamp: nowIso
          };
          const writes = [
            // 1. Update Vault root document
            {
              update: {
                name: vaultDoc.name,
                fields: {
                  ...vaultDoc.fields,
                  memberUids: toFirestoreValue(remainingMembers),
                  targetRatio: toFirestoreValue(updatedRatio),
                  updatedAt: { stringValue: nowIso }
                }
              },
              updateMask: { fieldPaths: ["memberUids", "targetRatio", "updatedAt"] }
            },
            // 2. Update Member subcollection document to status 'left'
            {
              update: {
                name: `${baseUrl}/sharedVaults/${vaultId}/members/${user.id}`,
                fields: {
                  status: { stringValue: "left" },
                  leftAt: { stringValue: nowIso },
                  updatedAt: { stringValue: nowIso }
                }
              },
              updateMask: { fieldPaths: ["status", "leftAt", "updatedAt"] }
            },
            // 3. Log activity
            {
              update: {
                name: `${baseUrl}/sharedVaults/${vaultId}/activity/${activityId}`,
                fields: {
                  id: { stringValue: activity.id },
                  vaultId: { stringValue: activity.vaultId },
                  actorUid: { stringValue: activity.actorUid },
                  actorName: { stringValue: activity.actorName },
                  type: { stringValue: activity.type },
                  title: { stringValue: activity.title },
                  description: { stringValue: activity.description },
                  timestamp: { stringValue: activity.timestamp }
                }
              }
            }
          ];
          await commitFirestoreTransaction(token, baseUrl, txId, writes);
          return { success: true, vaultId, remainingMembers };
        } catch (err) {
          if (txId) {
            await rollbackFirestoreTransaction(token, baseUrl, txId);
          }
          throw err;
        }
      }
      /**
       * Archives a vault in Firestore or local database.
       */
      async archiveVault(vaultId, user) {
        if (user.isGuest) {
          return dbService.archiveVault(vaultId, user.id);
        }
        const sa = this.ensureConfigured(user.isGuest);
        const token = await getGoogleOAuthAccessToken(sa);
        const projectId = resolveProjectId(sa);
        const databaseId = resolveFirestoreDatabaseId();
        const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
        let txId = "";
        try {
          txId = await beginFirestoreTransaction(token, baseUrl);
          const vaultRes = await fetch(`${baseUrl}/sharedVaults/${vaultId}?transaction=${encodeURIComponent(txId)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!vaultRes.ok) {
            await rollbackFirestoreTransaction(token, baseUrl, txId);
            throw new VaultServiceError("Vault not found or access denied", 404, "VAULT_NOT_FOUND");
          }
          const vaultDoc = await vaultRes.json();
          const vaultData = fromFirestoreDoc(vaultDoc);
          const currentMembers = Array.isArray(vaultData.memberUids) ? vaultData.memberUids : [];
          if (!currentMembers.includes(user.id)) {
            await rollbackFirestoreTransaction(token, baseUrl, txId);
            throw new VaultServiceError("User is not an active member of this vault", 403, "NOT_A_MEMBER");
          }
          const nowIso = (/* @__PURE__ */ new Date()).toISOString();
          const activityId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const activity = {
            id: activityId,
            vaultId,
            actorUid: user.id,
            actorName: user.name || "Member",
            type: "vault_archived",
            title: "Joint Vault Archived",
            description: `${user.name || "Member"} archived the vault`,
            timestamp: nowIso
          };
          const writes = [
            {
              update: {
                name: vaultDoc.name,
                fields: {
                  ...vaultDoc.fields,
                  status: { stringValue: "archived" },
                  archivedAt: { stringValue: nowIso },
                  archivedByUid: { stringValue: user.id },
                  updatedAt: { stringValue: nowIso }
                }
              },
              updateMask: { fieldPaths: ["status", "archivedAt", "archivedByUid", "updatedAt"] }
            },
            {
              update: {
                name: `${baseUrl}/sharedVaults/${vaultId}/activity/${activityId}`,
                fields: {
                  id: { stringValue: activity.id },
                  vaultId: { stringValue: activity.vaultId },
                  actorUid: { stringValue: activity.actorUid },
                  actorName: { stringValue: activity.actorName },
                  type: { stringValue: activity.type },
                  title: { stringValue: activity.title },
                  description: { stringValue: activity.description },
                  timestamp: { stringValue: activity.timestamp }
                }
              }
            }
          ];
          await commitFirestoreTransaction(token, baseUrl, txId, writes);
          return {
            ...vaultData,
            status: "archived",
            updatedAt: nowIso
          };
        } catch (err) {
          if (txId) {
            await rollbackFirestoreTransaction(token, baseUrl, txId);
          }
          throw err;
        }
      }
      /**
       * Rejects an invitation.
       */
      async rejectVaultInvitation(inviteCode, user) {
        const code = (inviteCode || "").trim().toUpperCase();
        if (!code) throw new VaultServiceError("Invite code is required", 400, "INVALID_CODE");
        if (user.isGuest) {
          return dbService.rejectVaultInvitation(code, user);
        }
        const sa = this.ensureConfigured(user.isGuest);
        const token = await getGoogleOAuthAccessToken(sa);
        const projectId = resolveProjectId(sa);
        const databaseId = resolveFirestoreDatabaseId();
        const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
        const queryUrl = `${baseUrl}:runQuery`;
        const queryBody = {
          structuredQuery: {
            from: [{ collectionId: "invitations", allDescendants: true }],
            where: {
              fieldFilter: {
                field: { fieldPath: "inviteCode" },
                op: "EQUAL",
                value: { stringValue: code }
              }
            },
            limit: 1
          }
        };
        const queryRes = await fetch(queryUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(queryBody)
        });
        const queryResults = await queryRes.json();
        const firstResult = queryResults.find((r) => r.document);
        if (!firstResult || !firstResult.document) {
          throw new VaultServiceError("Invalid invitation code", 400, "INVALID_CODE");
        }
        const inviteDoc = firstResult.document;
        const inviteData = fromFirestoreDoc(inviteDoc);
        if (inviteData.status !== "pending") {
          throw new VaultServiceError(
            `Invitation cannot be rejected because it is already ${inviteData.status}`,
            400,
            "INVITATION_INVALID"
          );
        }
        if (inviteData.invitedEmail) {
          const normalizedInvited = inviteData.invitedEmail.trim().toLowerCase();
          const normalizedUser = (user.email || "").trim().toLowerCase();
          if (!normalizedUser || normalizedInvited !== normalizedUser) {
            throw new VaultServiceError("This invitation was sent to a different email address", 403, "EMAIL_MISMATCH");
          }
        }
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const writes = [
          {
            update: {
              name: inviteDoc.name,
              fields: {
                ...inviteDoc.fields,
                status: { stringValue: "rejected" },
                rejectedByUid: { stringValue: user.id },
                rejectedAt: { stringValue: nowIso },
                updatedAt: { stringValue: nowIso }
              }
            },
            updateMask: { fieldPaths: ["status", "rejectedByUid", "rejectedAt", "updatedAt"] }
          }
        ];
        const commitRes = await fetch(`${baseUrl}:commit`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ writes })
        });
        if (!commitRes.ok) {
          const errText = await commitRes.text();
          throw new VaultServiceError(`Failed to reject vault invitation: ${errText}`, 500, "FIRESTORE_COMMIT_FAILED");
        }
        return {
          ...inviteData,
          status: "rejected",
          updatedAt: nowIso
        };
      }
      /**
       * Revokes an invitation from a vault.
       */
      async revokeVaultInvitation(vaultId, inviteId, user) {
        if (user.isGuest) {
          const success = dbService.revokeVaultInvitation(vaultId, inviteId, user.id);
          return { success };
        }
        const sa = this.ensureConfigured(user.isGuest);
        const token = await getGoogleOAuthAccessToken(sa);
        const projectId = resolveProjectId(sa);
        const databaseId = resolveFirestoreDatabaseId();
        const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
        const vaultRes = await fetch(`${baseUrl}/sharedVaults/${vaultId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!vaultRes.ok) throw new VaultServiceError("Vault not found", 404, "VAULT_NOT_FOUND");
        const vaultDoc = await vaultRes.json();
        const vaultData = fromFirestoreDoc(vaultDoc);
        if (!vaultData.memberUids.includes(user.id)) {
          throw new VaultServiceError("Unauthorized to revoke invitations for this vault", 403, "UNAUTHORIZED");
        }
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const writes = [
          {
            update: {
              name: `${baseUrl}/sharedVaults/${vaultId}/invitations/${inviteId}`,
              fields: {
                status: { stringValue: "revoked" },
                revokedAt: { stringValue: nowIso },
                updatedAt: { stringValue: nowIso }
              }
            },
            updateMask: { fieldPaths: ["status", "revokedAt", "updatedAt"] }
          }
        ];
        const commitRes = await fetch(`${baseUrl}:commit`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ writes })
        });
        return { success: commitRes.ok };
      }
      /**
       * Reverses a vault expense.
       */
      async reverseVaultExpense(vaultId, expenseId, user, reason) {
        if (user.isGuest) {
          return dbService.reverseVaultExpense(vaultId, expenseId, user.id);
        }
        const sa = this.ensureConfigured(user.isGuest);
        const token = await getGoogleOAuthAccessToken(sa);
        const projectId = resolveProjectId(sa);
        const databaseId = resolveFirestoreDatabaseId();
        const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
        const vaultRes = await fetch(`${baseUrl}/sharedVaults/${vaultId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!vaultRes.ok) {
          throw new VaultServiceError("Vault not found", 404, "VAULT_NOT_FOUND");
        }
        const vaultDoc = await vaultRes.json();
        const vaultData = fromFirestoreDoc(vaultDoc);
        const memberUids = Array.isArray(vaultData.memberUids) ? vaultData.memberUids : [];
        if (!memberUids.includes(user.id)) {
          throw new VaultServiceError("User is not an active member of this vault", 403, "NOT_A_MEMBER");
        }
        const expenseRes = await fetch(`${baseUrl}/sharedVaults/${vaultId}/expenses/${expenseId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!expenseRes.ok) {
          throw new VaultServiceError("Expense not found", 404, "EXPENSE_NOT_FOUND");
        }
        const expenseDoc = await expenseRes.json();
        const expenseData = fromFirestoreDoc(expenseDoc);
        if (expenseData.status === "reversed") {
          throw new VaultServiceError("Expense has already been reversed", 400, "ALREADY_REVERSED");
        }
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const activityId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const writes = [
          {
            update: {
              name: `${baseUrl}/sharedVaults/${vaultId}/expenses/${expenseId}`,
              fields: {
                status: { stringValue: "reversed" },
                reversedAt: { stringValue: nowIso },
                reversedByUid: { stringValue: user.id },
                reversalReason: { stringValue: reason || "Reversed by member" },
                updatedAt: { stringValue: nowIso }
              }
            },
            updateMask: { fieldPaths: ["status", "reversedAt", "reversedByUid", "reversalReason", "updatedAt"] }
          },
          {
            update: {
              name: `${baseUrl}/sharedVaults/${vaultId}/activity/${activityId}`,
              fields: {
                id: { stringValue: activityId },
                vaultId: { stringValue: vaultId },
                actorUid: { stringValue: user.id },
                actorName: { stringValue: "Member" },
                type: { stringValue: "expense_reversed" },
                title: { stringValue: "Joint Expense Reversed" },
                description: { stringValue: reason || "Expense was reversed" },
                timestamp: { stringValue: nowIso }
              }
            }
          }
        ];
        const commitRes = await fetch(`${baseUrl}:commit`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ writes })
        });
        if (!commitRes.ok) {
          const errText = await commitRes.text();
          throw new VaultServiceError(`Failed to reverse vault expense: ${errText}`, 500, "FIRESTORE_COMMIT_FAILED");
        }
        return { success: true };
      }
      /**
       * Fetches full vault summary including subcollections.
       */
      async getVaultSummary(vaultId, userId) {
        const sa = resolveServiceAccount();
        if (!sa) {
          return dbService.getVaultSummary(vaultId, userId);
        }
        const token = await getGoogleOAuthAccessToken(sa);
        const projectId = resolveProjectId(sa);
        const databaseId = resolveFirestoreDatabaseId();
        const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
        try {
          const vRes = await fetch(`${baseUrl}/sharedVaults/${vaultId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!vRes.ok) return null;
          const vDoc = await vRes.json();
          const vault = fromFirestoreDoc(vDoc);
          if (!vault.memberUids || !vault.memberUids.includes(userId)) return null;
          const fetchList = async (col) => {
            const res = await fetch(`${baseUrl}/sharedVaults/${vaultId}/${col}?pageSize=100`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) return [];
            const data = await res.json();
            return (data.documents || []).map(fromFirestoreDoc);
          };
          const [members, contributions, expenses, settlements, activities] = await Promise.all([
            fetchList("members"),
            fetchList("contributions"),
            fetchList("expenses"),
            fetchList("settlements"),
            fetchList("activity")
          ]);
          const activeMembers = members.filter((m) => m.status === "active");
          const activeContributions = contributions.filter((c) => c.status === "active");
          const activeExpenses = expenses.filter((e) => e.status === "active");
          return buildVaultSummary(
            vault,
            activeMembers,
            activeContributions,
            activeExpenses,
            settlements,
            activities
          );
        } catch (err) {
          console.warn("[vaultBackendService] getVaultSummary error:", err);
          return dbService.getVaultSummary(vaultId, userId);
        }
      }
    };
    vaultBackendService = new VaultBackendService();
  }
});

// src/lib/sheetHub/schemaDetector.ts
var schemaDetector_exports = {};
__export(schemaDetector_exports, {
  classifySheetPurpose: () => classifySheetPurpose,
  colIndexToLetter: () => colIndexToLetter2,
  detectHeaderRowCandidates: () => detectHeaderRowCandidates,
  detectHeaderRowIndex: () => detectHeaderRowIndex,
  detectTabSchema: () => detectTabSchema,
  detectWorkbookSchema: () => detectWorkbookSchema,
  extractCrossSheetFormulas: () => extractCrossSheetFormulas,
  extractDashboardReferenceData: () => extractDashboardReferenceData,
  normalizeFieldKey: () => normalizeFieldKey
});
function colIndexToLetter2(colIndex) {
  let n = Math.max(0, Math.floor(colIndex));
  let result = "";
  while (n >= 0) {
    result = String.fromCharCode(n % 26 + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}
function normalizeFieldKey(headerName, colIndex) {
  const slug = headerName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  return slug ? `${slug}_${colIndex}` : `col_${colIndexToLetter2(colIndex).toLowerCase()}`;
}
function isEmptyScalar(v) {
  if (v === null || v === void 0) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  return false;
}
function isNonEmptyCell(cell) {
  if (!cell) return false;
  if (cell.formula && cell.formula.trim().length > 0) return true;
  if (cell.dataValidationType && cell.dataValidationType.trim().length > 0) return true;
  if (cell.isBooleanCell) return true;
  if (!isEmptyScalar(cell.value)) return true;
  if (cell.formattedValue && cell.formattedValue.trim().length > 0) return true;
  return false;
}
function cellText(cell) {
  if (!cell) return "";
  if (typeof cell.formattedValue === "string" && cell.formattedValue.trim() !== "") {
    return cell.formattedValue.trim();
  }
  if (cell.value === null || cell.value === void 0) return "";
  return String(cell.value).trim();
}
function detectHeaderRowCandidates(rows) {
  const maxScan = Math.min(rows.length, 25);
  const candidates = [];
  for (let r = 0; r < maxScan; r++) {
    const row = rows[r] || [];
    const nonEmptyCells = row.filter((c) => isNonEmptyCell(c));
    if (nonEmptyCells.length === 0) continue;
    const texts = nonEmptyCells.map((c) => cellText(c)).filter(Boolean);
    if (texts.length === 0) continue;
    const distinctTexts = new Set(texts.map((t) => t.toLowerCase()));
    const stringLikeCount = nonEmptyCells.filter(
      (c) => !c.formula && !c.isBooleanCell && typeof c.value === "string" && c.value.trim().length > 0 && c.value.trim().length <= 80
    ).length;
    const formulaCount = nonEmptyCells.filter((c) => Boolean(c.formula)).length;
    const avgLen = texts.reduce((sum, t) => sum + t.length, 0) / Math.max(1, texts.length);
    const headerKeywordMatches = texts.filter((t) => HEADER_KEYWORD_REGEX.test(t)).length;
    const nextRow = rows[r + 1] || [];
    const nextNonEmpty = nextRow.filter((c) => isNonEmptyCell(c)).length;
    let score = 0;
    score += nonEmptyCells.length * 3;
    score += stringLikeCount * 2.5;
    score += distinctTexts.size === nonEmptyCells.length ? 5 : -4;
    score += headerKeywordMatches * 6;
    score -= formulaCount * 8;
    const booleanCount = nonEmptyCells.filter((c) => c.isBooleanCell || typeof c.value === "boolean").length;
    score -= booleanCount * 12;
    if (avgLen > 60) score -= 10;
    if (nonEmptyCells.length === 1 && rows.length > r + 1 && nextNonEmpty > 1) score -= 16;
    if (nextNonEmpty >= Math.max(2, Math.floor(nonEmptyCells.length * 0.5))) score += 6;
    const numericCells = nonEmptyCells.filter(
      (c) => typeof c.value === "number" || /^\d+(\.\d+)?$/.test(cellText(c))
    ).length;
    if (numericCells / nonEmptyCells.length >= 0.7) {
      score -= 15;
    }
    score -= r * 0.25;
    if (score > 0) {
      let confidence = "low";
      if (score >= 22 && (headerKeywordMatches >= 1 || distinctTexts.size >= 3)) {
        confidence = "high";
      } else if (score >= 12) {
        confidence = "medium";
      }
      candidates.push({
        rowIndex0: r,
        rowNumber: r + 1,
        score,
        confidence,
        nonEmptyCount: nonEmptyCells.length,
        sampleHeaders: texts.slice(0, 6)
      });
    }
  }
  if (candidates.length === 0) {
    const firstNonEmpty = rows.findIndex((r) => r.some((c) => isNonEmptyCell(c)));
    if (firstNonEmpty >= 0) {
      const row = rows[firstNonEmpty] || [];
      const nonEmptyCells = row.filter((c) => isNonEmptyCell(c));
      const texts = nonEmptyCells.map((c) => cellText(c)).filter(Boolean);
      candidates.push({
        rowIndex0: firstNonEmpty,
        rowNumber: firstNonEmpty + 1,
        score: 1,
        confidence: "low",
        nonEmptyCount: nonEmptyCells.length,
        sampleHeaders: texts.slice(0, 6)
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}
function detectHeaderRowIndex(rows) {
  const candidates = detectHeaderRowCandidates(rows);
  return candidates.length > 0 ? candidates[0].rowIndex0 : -1;
}
function inferSemanticRole(headerName, inferredType, colIndex) {
  const h = headerName.trim().toLowerCase();
  if (inferredType === "formula") {
    return { role: "metric", confidence: "high" };
  }
  if (inferredType === "checkbox" || inferredType === "boolean") {
    if (/\b(done|complete|completed|checked|finish|finished|studied|revised|paid)\b/.test(h)) {
      return { role: "done", confidence: "high" };
    }
    return { role: "done", confidence: "medium" };
  }
  if (inferredType === "url" || /\b(link|url|website|resource|ref|reference)\b/.test(h)) {
    return { role: "link", confidence: inferredType === "url" ? "high" : "medium" };
  }
  if (inferredType === "date" || /\b(date|due|deadline|exam\s*date|scheduled|target\s*date)\b/.test(h)) {
    return { role: "due_date", confidence: inferredType === "date" ? "high" : "medium" };
  }
  if (inferredType === "priority" || /\b(priority|severity|importance|urgency)\b/.test(h)) {
    return { role: "priority", confidence: "high" };
  }
  if (inferredType === "status" || /\b(status|state|stage|phase)\b/.test(h)) {
    return { role: "status", confidence: "high" };
  }
  if (/^(id|row[_\s]?id|record[_\s]?id|uid|code|sku|key|_ff_row_id)$/.test(h) || /\bid$/.test(h)) {
    return { role: "id", confidence: "high" };
  }
  if (/\b(note|notes|practice|comment|comments|remark|remarks|description|detail|details|summary|memo)\b/.test(h)) {
    return { role: "notes", confidence: "high" };
  }
  if (/\b(subtopic|sub[\s_-]?topic|item|task|title|name|lesson|question|problem)\b/.test(h)) {
    return { role: "title", confidence: "high" };
  }
  if (/\b(module|unit|section|chapter|category|subject|phase|pillar|domain|group)\b/.test(h)) {
    return { role: "group", confidence: "high" };
  }
  if (/\b(topic|sub[\s_-]?section|sub[\s_-]?group|area|theme)\b/.test(h)) {
    return { role: "subgroup", confidence: "high" };
  }
  if (inferredType === "currency" || inferredType === "number") {
    return { role: "metric", confidence: "medium" };
  }
  if (colIndex === 0 && inferredType === "text") {
    return { role: "title", confidence: "low" };
  }
  return { role: "custom", confidence: "low" };
}
function inferColumnMapping(colIndex, headerName, columnCells) {
  const colLetter = colIndexToLetter2(colIndex);
  const cleanHeader = headerName.trim() || `Column ${colLetter}`;
  const fieldKey = normalizeFieldKey(cleanHeader, colIndex);
  const hLower = cleanHeader.toLowerCase();
  const nonEmpty = columnCells.filter((c) => isNonEmptyCell(c));
  const totalSample = nonEmpty.length;
  let formulaCount = 0;
  let checkboxValidationCount = 0;
  let boolCellCount = 0;
  let boolTextCount = 0;
  let dropdownValidationCount = 0;
  const dropdownOptions = /* @__PURE__ */ new Set();
  let currencyFormatCount = 0;
  let dateFormatCount = 0;
  let numberCount = 0;
  let urlCount = 0;
  let dateStringCount = 0;
  let currencyStringCount = 0;
  let longTextCount = 0;
  let priorityMatchCount = 0;
  let statusMatchCount = 0;
  const distinctStrings = /* @__PURE__ */ new Set();
  for (const cell of nonEmpty) {
    if (cell.formula && cell.formula.trim().length > 0) formulaCount++;
    if (cell.dataValidationType === "BOOLEAN") checkboxValidationCount++;
    if (cell.dataValidationType === "ONE_OF_LIST") {
      dropdownValidationCount++;
      for (const opt of cell.dataValidationValues || []) {
        if (opt.trim()) dropdownOptions.add(opt.trim());
      }
    }
    if (cell.isBooleanCell || typeof cell.value === "boolean") boolCellCount++;
    if (cell.numberFormatType === "CURRENCY") currencyFormatCount++;
    if (cell.numberFormatType === "DATE" || cell.numberFormatType === "DATE_TIME") dateFormatCount++;
    if (typeof cell.value === "number" && !cell.numberFormatType?.includes("DATE")) numberCount++;
    const txt = cellText(cell);
    if (txt) {
      const lower = txt.toLowerCase();
      distinctStrings.add(txt);
      if (BOOLEAN_TEXT_SET.has(lower)) boolTextCount++;
      if (URL_VALUE_REGEX.test(txt)) urlCount++;
      if (ISO_DATE_REGEX.test(txt) || HUMAN_DATE_REGEX.test(txt)) dateStringCount++;
      if (CURRENCY_TEXT_REGEX.test(txt)) currencyStringCount++;
      if (txt.length >= 80 || txt.includes("\n")) longTextCount++;
      if (PRIORITY_VALUE_SET.has(lower)) priorityMatchCount++;
      if (STATUS_VALUE_SET.has(lower)) statusMatchCount++;
    }
  }
  let inferredType = "text";
  let typeConfidence = "low";
  let editable = true;
  let readOnlyReason = null;
  let enumOptions;
  if (totalSample > 0 && formulaCount / totalSample >= 0.4) {
    inferredType = "formula";
    typeConfidence = "high";
    editable = false;
    readOnlyReason = "Formula-derived column (protected from overwrite)";
  } else if (totalSample > 0 && checkboxValidationCount / totalSample >= 0.5) {
    inferredType = "checkbox";
    typeConfidence = "high";
  } else if (totalSample > 0 && boolCellCount / totalSample >= 0.7) {
    inferredType = "boolean";
    typeConfidence = "high";
  } else if (totalSample > 0 && dropdownValidationCount / totalSample >= 0.5) {
    const opts = Array.from(dropdownOptions);
    const isPriorityEnum = opts.some((o) => PRIORITY_VALUE_SET.has(o.toLowerCase()));
    inferredType = isPriorityEnum ? "priority" : "status";
    typeConfidence = "high";
    enumOptions = opts;
  } else if (totalSample > 0 && dateFormatCount / totalSample >= 0.6) {
    inferredType = "date";
    typeConfidence = "high";
  } else if (totalSample > 0 && currencyFormatCount / totalSample >= 0.6) {
    inferredType = "currency";
    typeConfidence = "high";
  } else if (totalSample > 0 && urlCount / totalSample >= 0.6) {
    inferredType = "url";
    typeConfidence = "high";
  } else if (totalSample > 0 && dateStringCount / totalSample >= 0.7) {
    inferredType = "date";
    typeConfidence = "medium";
  } else if (totalSample > 0 && currencyStringCount / totalSample >= 0.6) {
    inferredType = "currency";
    typeConfidence = "medium";
  } else if (totalSample > 0 && boolTextCount / totalSample >= 0.8) {
    inferredType = "boolean";
    typeConfidence = "medium";
  } else if (totalSample > 0 && numberCount / totalSample >= 0.8) {
    if (/\b(amount|price|cost|budget|fee|salary|income|expense|inr|usd|rupee|paise)\b/.test(hLower)) {
      inferredType = "currency";
      typeConfidence = "medium";
    } else {
      inferredType = "number";
      typeConfidence = "high";
    }
  } else if (totalSample > 0 && priorityMatchCount / totalSample >= 0.7) {
    inferredType = "priority";
    typeConfidence = "medium";
    enumOptions = Array.from(distinctStrings).slice(0, 12);
  } else if (totalSample > 0 && statusMatchCount / totalSample >= 0.7) {
    inferredType = "status";
    typeConfidence = "medium";
    enumOptions = Array.from(distinctStrings).slice(0, 12);
  } else if (totalSample > 0 && longTextCount / totalSample >= 0.35 || /\b(note|notes|practice|comment|comments|description|remark|remarks|memo)\b/.test(hLower)) {
    inferredType = "long_text";
    typeConfidence = totalSample > 0 && longTextCount > 0 ? "high" : "medium";
  } else if (totalSample > 0) {
    inferredType = "text";
    typeConfidence = "high";
  } else {
    if (/\b(done|complete|completed|checked)\b/.test(hLower)) {
      inferredType = "boolean";
      typeConfidence = "medium";
    } else if (/\b(date|due|deadline)\b/.test(hLower)) {
      inferredType = "date";
      typeConfidence = "medium";
    } else if (/\b(link|url)\b/.test(hLower)) {
      inferredType = "url";
      typeConfidence = "medium";
    } else {
      inferredType = "text";
      typeConfidence = "low";
    }
  }
  const { role: semanticRole, confidence: roleConfidence } = inferSemanticRole(
    cleanHeader,
    inferredType,
    colIndex
  );
  const rank = { high: 2, medium: 1, low: 0 };
  const combinedRank = Math.min(rank[typeConfidence], rank[roleConfidence]);
  const confidence = combinedRank === 2 ? "high" : combinedRank === 1 ? "medium" : "low";
  const requiresConfirmation = confidence !== "high" || totalSample === 0;
  const isUncertain = confidence === "low" || semanticRole === "custom";
  return {
    colIndex,
    colLetter,
    fieldKey,
    headerName: cleanHeader,
    displayName: cleanHeader,
    inferredType,
    confirmedType: inferredType,
    semanticRole,
    confidence,
    editable,
    readOnlyReason,
    requiresConfirmation,
    isUncertain,
    mappingConfidence: confidence,
    ...enumOptions && enumOptions.length > 0 ? { enumOptions } : {}
  };
}
function parseNumberOrPct(text) {
  if (!text) return void 0;
  const trimmed = text.trim();
  if (/^\d+(?:\.\d+)?\s*%$/.test(trimmed)) {
    const n = parseFloat(trimmed.replace("%", "").trim());
    if (!isNaN(n)) return { val: n, type: "percent" };
  }
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const n = parseFloat(trimmed);
    if (!isNaN(n)) return { val: n, type: "number" };
  }
  return void 0;
}
function extractCrossSheetFormulas(rows, allKnownTabTitles) {
  const knownSet = allKnownTabTitles ? new Set(allKnownTabTitles.map((t) => t.trim().toLowerCase())) : null;
  const list = [];
  const CROSS_SHEET_REF_REGEX = /(?:'([^']+)'|([A-Za-z0-9_]+))!([A-Za-z0-9:$]+)/g;
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx] || [];
    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      const cell = row[cIdx];
      if (!cell || !cell.formula) continue;
      const formula = cell.formula.trim();
      const sourceCell = `${colIndexToLetter2(cIdx)}${rIdx + 1}`;
      if (/#REF!/i.test(formula)) {
        list.push({
          sourceCell,
          formula,
          targetSheetTitle: "Unknown (#REF!)",
          isBroken: true,
          brokenReason: "Formula contains broken reference (#REF!)"
        });
        continue;
      }
      CROSS_SHEET_REF_REGEX.lastIndex = 0;
      let match;
      while ((match = CROSS_SHEET_REF_REGEX.exec(formula)) !== null) {
        const targetSheetTitle = (match[1] || match[2] || "").trim();
        const targetRange = (match[3] || "").trim();
        if (!targetSheetTitle) continue;
        const isKnownSheet = knownSet ? knownSet.has(targetSheetTitle.toLowerCase()) : true;
        const isBroken = knownSet ? !isKnownSheet : false;
        const brokenReason = isBroken ? `Referenced sheet "${targetSheetTitle}" does not exist in workbook` : void 0;
        list.push({
          sourceCell,
          formula,
          targetSheetTitle,
          targetRange,
          isBroken,
          brokenReason
        });
      }
    }
  }
  return list;
}
function extractDashboardReferenceData(tabTitle, tabId, rows, allKnownTabTitles) {
  const crossSheetFormulas = extractCrossSheetFormulas(rows, allKnownTabTitles);
  const brokenReferencesCount = crossSheetFormulas.filter((f) => f.isBroken).length;
  const subjectMap = /* @__PURE__ */ new Map();
  const reasons = [];
  const detectedKpis = {};
  let totalSyllabusCount;
  let totalCompletedCount;
  let overallCompletionPct;
  for (const csf of crossSheetFormulas) {
    if (csf.isBroken) continue;
    const normSheet = csf.targetSheetTitle;
    if (!subjectMap.has(normSheet)) {
      subjectMap.set(normSheet, {
        subjectName: normSheet,
        referencedSheetTitle: normSheet,
        formulaReferences: [csf.formula]
      });
    } else {
      const existing = subjectMap.get(normSheet);
      if (!existing.formulaReferences) existing.formulaReferences = [];
      existing.formulaReferences.push(csf.formula);
    }
  }
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx] || [];
    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      const cell = row[cIdx];
      const text = cellText(cell);
      if (!text) continue;
      const normLabel = text.replace(/[:\-]$/, "").trim();
      if (/^(total\s*(syllabus|topics?|records?|subtopics?|questions?|items?)|syllabus\s*count)$/i.test(normLabel)) {
        const valRight = parseNumberOrPct(cellText(row[cIdx + 1]));
        const valBelow = rIdx + 1 < rows.length ? parseNumberOrPct(cellText(rows[rIdx + 1][cIdx])) : void 0;
        const numVal = valRight ?? valBelow;
        if (numVal !== void 0 && numVal.type === "number") {
          totalSyllabusCount = numVal.val;
          detectedKpis[text] = numVal.val;
        }
      }
      if (/^(total\s*(completed|done)|completed\s*(topics?|count)|theory\s*completed)$/i.test(normLabel)) {
        const valRight = parseNumberOrPct(cellText(row[cIdx + 1]));
        const valBelow = rIdx + 1 < rows.length ? parseNumberOrPct(cellText(rows[rIdx + 1][cIdx])) : void 0;
        const numVal = valRight ?? valBelow;
        if (numVal !== void 0 && numVal.type === "number") {
          totalCompletedCount = numVal.val;
          detectedKpis[text] = numVal.val;
        }
      }
      if (/^(overall\s*(progress|completion)|completion\s*(rate|%|percentage)|progress\s*(%|percentage)?)$/i.test(normLabel)) {
        const valRight = parseNumberOrPct(cellText(row[cIdx + 1]));
        const valBelow = rIdx + 1 < rows.length ? parseNumberOrPct(cellText(rows[rIdx + 1][cIdx])) : void 0;
        const numVal = valRight ?? valBelow;
        if (numVal !== void 0) {
          overallCompletionPct = numVal.type === "percent" ? numVal.val : numVal.val <= 1 ? numVal.val * 100 : numVal.val;
          detectedKpis[text] = `${overallCompletionPct.toFixed(1)}%`;
        }
      }
    }
  }
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx] || [];
    if (row.some((c) => c && (c.isBooleanCell || typeof c.value === "boolean" || c.dataValidationType === "BOOLEAN"))) {
      continue;
    }
    const nonEmpty = row.filter((c) => isNonEmptyCell(c));
    if (nonEmpty.length < 2) continue;
    const firstTextIdx = row.findIndex((c) => {
      const t = cellText(c);
      return t && typeof t === "string" && !/^\d+(\.\d+)?%?$/.test(t) && !TOTAL_ROW_PATTERN.test(t) && t.length <= 60;
    });
    if (firstTextIdx >= 0) {
      const candidateSubjectName = cellText(row[firstTextIdx]).trim();
      const lowerCand = candidateSubjectName.toLowerCase();
      if (/^(subjects?|courses?|names?|titles?|items?|overview|summary|sl\.?\s*no\.?|#)$/i.test(candidateSubjectName)) {
        continue;
      }
      const remainingCells = row.slice(firstTextIdx + 1);
      const parsedValues = remainingCells.map((c) => parseNumberOrPct(cellText(c))).filter(Boolean);
      if (parsedValues.length >= 1) {
        const countCandidate = parsedValues.find((p) => p.type === "number");
        const pctCandidate = parsedValues.find((p) => p.type === "percent");
        const completedCandidate = parsedValues.filter((p) => p.type === "number")[1];
        const matchesKnownTab = allKnownTabTitles?.some((t) => t.trim().toLowerCase() === lowerCand);
        if (countCandidate || matchesKnownTab) {
          const existing = subjectMap.get(candidateSubjectName) || {
            subjectName: candidateSubjectName,
            referencedSheetTitle: matchesKnownTab ? allKnownTabTitles?.find((t) => t.trim().toLowerCase() === lowerCand) : candidateSubjectName
          };
          if (countCandidate && !existing.expectedTotalTopics) {
            existing.expectedTotalTopics = Math.round(countCandidate.val);
          }
          if (completedCandidate && !existing.expectedCompletedTopics) {
            existing.expectedCompletedTopics = Math.round(completedCandidate.val);
          }
          if (pctCandidate && !existing.expectedCompletionPct) {
            existing.expectedCompletionPct = pctCandidate.val;
          } else if (existing.expectedTotalTopics && existing.expectedCompletedTopics && !existing.expectedCompletionPct) {
            existing.expectedCompletionPct = Math.round(existing.expectedCompletedTopics / existing.expectedTotalTopics * 100);
          }
          existing.rawRowIndex = rIdx + 1;
          subjectMap.set(candidateSubjectName, existing);
        }
      }
    }
  }
  const subjectList = Array.from(subjectMap.values());
  if (totalSyllabusCount === void 0 && subjectList.length > 0) {
    const sumExpected = subjectList.reduce((acc, s) => acc + (s.expectedTotalTopics || 0), 0);
    if (sumExpected > 0) {
      totalSyllabusCount = sumExpected;
    }
  }
  if (totalCompletedCount === void 0 && subjectList.length > 0) {
    const sumCompleted = subjectList.reduce((acc, s) => acc + (s.expectedCompletedTopics || 0), 0);
    if (sumCompleted > 0) {
      totalCompletedCount = sumCompleted;
    }
  }
  if (overallCompletionPct === void 0 && totalSyllabusCount && totalCompletedCount) {
    overallCompletionPct = Math.round(totalCompletedCount / totalSyllabusCount * 100);
  }
  let confidenceScore = 0;
  const distinctReferencedSheets = new Set(
    crossSheetFormulas.filter((f) => !f.isBroken).map((f) => f.targetSheetTitle.toLowerCase())
  );
  if (distinctReferencedSheets.size >= 2) {
    confidenceScore += 0.55;
    reasons.push(
      `Contains cross-sheet formulas referencing ${distinctReferencedSheets.size} distinct sheets (${Array.from(distinctReferencedSheets).join(", ")}).`
    );
  } else if (distinctReferencedSheets.size === 1) {
    confidenceScore += 0.35;
    reasons.push(`Contains cross-sheet formulas referencing sheet "${Array.from(distinctReferencedSheets)[0]}".`);
  }
  if (subjectList.length >= 2 && subjectList.some((s) => s.expectedTotalTopics)) {
    confidenceScore += 0.4;
    reasons.push(`Detected summary table with ${subjectList.length} subjects and expected topic metrics.`);
  }
  if (totalSyllabusCount !== void 0 || overallCompletionPct !== void 0) {
    confidenceScore += 0.2;
    reasons.push(
      `Extracted overall syllabus KPI metrics: ${totalSyllabusCount ? `Total Topics: ${totalSyllabusCount}` : ""} ${overallCompletionPct !== void 0 ? `Completion: ${overallCompletionPct}%` : ""}`.trim()
    );
  }
  if (brokenReferencesCount > 0) {
    reasons.push(`Detected ${brokenReferencesCount} broken cross-sheet formula reference(s) (#REF! or missing sheets).`);
  }
  const isProbStats = /^prob(ability)?\s*(&|and)?\s*stat(istics|s)?$/i.test(tabTitle.trim());
  const titleMatchesOverview = !isProbStats && OVERVIEW_TAB_NAME_REGEX.test(tabTitle.trim());
  if (titleMatchesOverview) {
    confidenceScore += 0.25;
    reasons.push(`Sheet title "${tabTitle}" matches standard overview/dashboard conventions.`);
  }
  const hasCrossSheetFormulas = distinctReferencedSheets.size > 0;
  const isRecognizedDashboard = hasCrossSheetFormulas ? confidenceScore >= 0.5 || titleMatchesOverview && (subjectList.length > 0 || crossSheetFormulas.length > 0) : titleMatchesOverview && (subjectList.length >= 2 || totalSyllabusCount !== void 0) && confidenceScore >= 0.6;
  const confidence = confidenceScore >= 0.75 ? "high" : confidenceScore >= 0.5 ? "medium" : "low";
  return {
    sheetTitle: tabTitle,
    sheetId: tabId,
    isRecognizedDashboard,
    confidence,
    confidenceScore: Math.min(1, confidenceScore),
    reasons,
    totalSyllabusCount,
    totalCompletedCount,
    overallCompletionPct,
    subjectReferences: subjectList,
    crossSheetFormulas,
    brokenReferencesCount,
    detectedKpis: Object.keys(detectedKpis).length > 0 ? detectedKpis : void 0
  };
}
function classifySheetPurpose(tabTitle, headerRow, dataRows, columns, formulaCellCount, totalNonEmptyCells, allKnownTabTitles) {
  const normTitle = tabTitle.trim();
  const isProbStatsSubject = /^prob(ability)?\s*(&|and)?\s*stat(istics|s)?$/i.test(normTitle);
  const titleMatchesOverview = !isProbStatsSubject && OVERVIEW_TAB_NAME_REGEX.test(normTitle);
  const titleMatchesInstructions = INSTRUCTIONS_KEYWORD_REGEX.test(normTitle);
  if (dataRows.length === 0) {
    return {
      purpose: "empty",
      role: "ignored",
      confidence: "medium",
      confidenceScore: 0.5,
      requiresUserClassification: false,
      reason: "Header row found without data rows yet."
    };
  }
  const dashboardRef = extractDashboardReferenceData(
    tabTitle,
    0,
    [headerRow, ...dataRows],
    allKnownTabTitles
  );
  if (dashboardRef.isRecognizedDashboard) {
    return {
      purpose: "dashboard",
      role: "overview",
      confidence: dashboardRef.confidence,
      confidenceScore: dashboardRef.confidenceScore,
      requiresUserClassification: false,
      reason: dashboardRef.reasons.join(" ")
    };
  }
  const sampleDataRows = dataRows.slice(0, 50);
  let aggregateFormulaCount = 0;
  let summaryKeywordRowCount = 0;
  let pureNumericCellInTopicColCount = 0;
  let totalTextChars = 0;
  let textCellCount = 0;
  let longTextCellCount = 0;
  for (const row of sampleDataRows) {
    let rowHasSummaryWord = false;
    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      const cell = row[cIdx];
      if (!isNonEmptyCell(cell)) continue;
      if (cell.formula && AGGREGATE_FORMULA_REGEX.test(cell.formula)) {
        aggregateFormulaCount++;
      }
      const text = cellText(cell);
      if (text) {
        totalTextChars += text.length;
        textCellCount++;
        if (text.length > 70) {
          longTextCellCount++;
        }
        if (SUMMARY_KEYWORD_REGEX.test(text.trim())) {
          rowHasSummaryWord = true;
        }
      }
    }
    if (rowHasSummaryWord) {
      summaryKeywordRowCount++;
    }
  }
  const candidateTopicCol = columns.find((c) => c.semanticRole === "title") || columns[1] || columns[0];
  if (candidateTopicCol) {
    for (const row of sampleDataRows) {
      const cell = row[candidateTopicCol.colIndex];
      const text = cellText(cell);
      if (text && /^\s*#?\s*\d+(\.\d+)?\s*%?\s*$/.test(text)) {
        pureNumericCellInTopicColCount++;
      }
    }
  }
  const formulaRatio = formulaCellCount / Math.max(1, totalNonEmptyCells);
  const summaryRowRatio = summaryKeywordRowCount / Math.max(1, sampleDataRows.length);
  const numericTopicRatio = pureNumericCellInTopicColCount / Math.max(1, sampleDataRows.length);
  const avgTextLen = textCellCount > 0 ? totalTextChars / textCellCount : 0;
  const longTextRatio = textCellCount > 0 ? longTextCellCount / textCellCount : 0;
  let syllabusHeaderMatches = 0;
  for (const col of columns) {
    if (SYLLABUS_HEADER_REGEX.test(col.headerName)) {
      syllabusHeaderMatches++;
    }
  }
  const hasDoneOrStatus = columns.some(
    (c) => c.semanticRole === "done" || c.inferredType === "checkbox" || c.inferredType === "boolean"
  );
  let keyValueMatchCount = 0;
  if (columns.length >= 2 && columns.length <= 3 && sampleDataRows.length <= 30) {
    for (const row of sampleDataRows) {
      const c0Text = cellText(row[columns[0].colIndex]);
      if (c0Text && (c0Text.endsWith(":") || METADATA_KEY_REGEX.test(c0Text.replace(/:$/, "").trim()))) {
        keyValueMatchCount++;
      }
    }
  }
  const isKeyValueLayout = keyValueMatchCount >= Math.min(3, sampleDataRows.length);
  let syllabusScore = 0;
  let summaryScore = 0;
  let instructionsScore = 0;
  let metadataScore = 0;
  if (syllabusHeaderMatches >= 2) syllabusScore += 0.55;
  else if (syllabusHeaderMatches === 1) syllabusScore += 0.3;
  if (hasDoneOrStatus) syllabusScore += 0.25;
  if (numericTopicRatio < 0.25 && avgTextLen >= 4 && avgTextLen <= 90) syllabusScore += 0.25;
  if (sampleDataRows.length >= 10) syllabusScore += 0.1;
  if (summaryRowRatio > 0.2) syllabusScore -= 0.3;
  if (formulaRatio > 0.3) syllabusScore -= 0.3;
  if (numericTopicRatio > 0.5) syllabusScore -= 0.4;
  if (aggregateFormulaCount > 0) summaryScore += 0.5;
  if (formulaRatio >= 0.25) summaryScore += 0.35;
  if (summaryRowRatio >= 0.15) summaryScore += 0.4;
  if (numericTopicRatio >= 0.4 && sampleDataRows.length > 0) summaryScore += 0.4;
  if (titleMatchesOverview) summaryScore += 0.35;
  if (titleMatchesInstructions) instructionsScore += 0.45;
  if (columns.length <= 2 && avgTextLen > 60) instructionsScore += 0.4;
  if (longTextRatio > 0.3) instructionsScore += 0.35;
  if (syllabusHeaderMatches === 0 && !hasDoneOrStatus) instructionsScore += 0.2;
  if (isKeyValueLayout) metadataScore += 0.7;
  if (/meta|config|info|settings/i.test(normTitle)) metadataScore += 0.3;
  const maxScore = Math.max(syllabusScore, summaryScore, instructionsScore, metadataScore);
  if (metadataScore >= 0.65 && metadataScore >= maxScore) {
    return {
      purpose: "metadata",
      role: "overview",
      confidence: "high",
      confidenceScore: Math.min(1, metadataScore),
      requiresUserClassification: false,
      reason: "Key-value configuration/metadata layout detected."
    };
  }
  if (instructionsScore >= 0.65 && instructionsScore >= maxScore) {
    return {
      purpose: "instructions",
      role: "overview",
      confidence: "high",
      confidenceScore: Math.min(1, instructionsScore),
      requiresUserClassification: false,
      reason: "Informational text / instructions layout with paragraph content detected."
    };
  }
  if (summaryScore >= 0.6 && summaryScore > syllabusScore) {
    return {
      purpose: "summary",
      role: "overview",
      confidence: "high",
      confidenceScore: Math.min(1, summaryScore),
      requiresUserClassification: false,
      reason: titleMatchesOverview ? `Tab purpose identified as summary/overview (detected aggregate formula/count density and name "${normTitle}").` : "Tab structure contains summary rows, aggregate counts, or formula density matching an overview/summary sheet."
    };
  }
  if (syllabusScore >= 0.6 && syllabusScore > summaryScore) {
    return {
      purpose: "syllabus",
      role: "data",
      confidence: "high",
      confidenceScore: Math.min(1, syllabusScore),
      requiresUserClassification: false,
      reason: "Structured tabular headers and distinct syllabus concept rows detected."
    };
  }
  if (titleMatchesOverview && summaryScore >= 0.4) {
    return {
      purpose: "summary",
      role: "overview",
      confidence: "medium",
      confidenceScore: 0.6,
      requiresUserClassification: false,
      reason: `Tab name "${normTitle}" and row layout match an overview/summary sheet.`
    };
  }
  let referenceScore = 0;
  if (REFERENCE_KEYWORD_REGEX.test(normTitle)) referenceScore += 0.5;
  if (columns.length >= 2 && columns.length <= 4 && !hasDoneOrStatus && syllabusHeaderMatches === 0) {
    const hasIdOrKey = columns.some((c) => c.semanticRole === "id" || /code|key|term|abbr|acronym/i.test(c.headerName));
    const hasDesc = columns.some((c) => /desc|definition|meaning|detail/i.test(c.headerName));
    if (hasIdOrKey || hasDesc) referenceScore += 0.4;
  }
  if (referenceScore >= 0.6) {
    return {
      purpose: "reference",
      role: "reference",
      confidence: "high",
      confidenceScore: Math.min(1, referenceScore),
      requiresUserClassification: false,
      reason: "Reference/lookup or glossary table detected (non-syllabus definition mapping)."
    };
  }
  const isLikelyData = syllabusScore >= summaryScore;
  return {
    purpose: "uncertain",
    role: isLikelyData ? "data" : "overview",
    confidence: "low",
    confidenceScore: Math.max(0.3, maxScore),
    requiresUserClassification: true,
    reason: `Unconventional tab structure (syllabus score: ${syllabusScore.toFixed(2)}, summary score: ${summaryScore.toFixed(2)}). Please confirm tab purpose before import.`
  };
}
function detectTabSchema(tab, allKnownTabTitles) {
  const rows = tab.rows || [];
  let nonEmptyRowCount = 0;
  let totalNonEmptyCells = 0;
  let formulaCellCount = 0;
  let maxColCount = 0;
  for (const row of rows) {
    let rowHasValue = false;
    if (row.length > maxColCount) maxColCount = row.length;
    for (const cell of row) {
      if (isNonEmptyCell(cell)) {
        rowHasValue = true;
        totalNonEmptyCells++;
        if (cell.formula && cell.formula.trim().length > 0) {
          formulaCellCount++;
        }
      }
    }
    if (rowHasValue) nonEmptyRowCount++;
  }
  if (nonEmptyRowCount === 0 || totalNonEmptyCells === 0) {
    return {
      sheetId: tab.sheetId,
      sheetTitle: tab.sheetTitle,
      role: "ignored",
      roleConfidence: "high",
      roleReason: "Tab contains no non-empty cells.",
      detectedPurpose: "empty",
      purposeConfidence: 1,
      requiresUserClassification: false,
      headerRowIndex: 0,
      dataStartRow: 1,
      dataEndColumn: "A",
      columns: [],
      suggestedIdentityStrategy: "composite_key",
      suggestedIdentityColumns: [],
      suggestedDefaultView: "table",
      suggestedGroupByFieldKey: null,
      requiresMappingConfirmation: false,
      sampleRowCount: 0,
      formulaCellCount: 0,
      sampleRows: []
    };
  }
  const formulaRatio = formulaCellCount / Math.max(1, totalNonEmptyCells);
  const isProbStatsSubject = /^prob(ability)?\s*(&|and)?\s*stat(istics|s)?$/i.test(tab.sheetTitle.trim());
  const isOverviewByName = !isProbStatsSubject && OVERVIEW_TAB_NAME_REGEX.test(tab.sheetTitle);
  const headerCandidates = detectHeaderRowCandidates(rows);
  const headerIdx0 = headerCandidates.length > 0 ? headerCandidates[0].rowIndex0 : -1;
  const headerRow = headerIdx0 >= 0 ? rows[headerIdx0] || [] : [];
  const dataRows = headerIdx0 >= 0 ? rows.slice(headerIdx0 + 1).filter((r) => r.some((c) => isNonEmptyCell(c))) : [];
  const activeColIndices = [];
  const scanCols = Math.max(headerRow.length, maxColCount);
  for (let c = 0; c < scanCols; c++) {
    const hasHeader = isNonEmptyCell(headerRow[c]);
    const hasData = dataRows.some((r) => isNonEmptyCell(r[c]));
    if (hasHeader || hasData) {
      activeColIndices.push(c);
    }
  }
  let lastSeenHeader = "";
  const columns = activeColIndices.map((cIdx) => {
    let headerLabel = cellText(headerRow[cIdx]);
    if (!headerLabel && lastSeenHeader) {
      headerLabel = `${lastSeenHeader} (Part ${colIndexToLetter2(cIdx)})`;
    } else if (headerLabel) {
      lastSeenHeader = headerLabel;
    }
    const colCells = dataRows.map((r) => r[cIdx] || { value: null });
    return inferColumnMapping(cIdx, headerLabel, colCells);
  });
  const dashboardReference = extractDashboardReferenceData(
    tab.sheetTitle,
    tab.sheetId,
    rows,
    allKnownTabTitles
  );
  const classification = classifySheetPurpose(
    tab.sheetTitle,
    headerRow,
    dataRows,
    columns,
    formulaCellCount,
    totalNonEmptyCells,
    allKnownTabTitles
  );
  const role = classification.role;
  const roleConfidence = classification.confidence;
  const roleReason = classification.reason;
  const detectedPurpose = classification.purpose;
  const purposeConfidence = classification.confidenceScore;
  const requiresUserClassification = classification.requiresUserClassification;
  if (role === "overview" || role === "summary" || role === "dashboard" || role === "reference" || role === "metadata" || role === "instructions") {
    for (const col of columns) {
      col.editable = false;
      if (!col.readOnlyReason) {
        col.readOnlyReason = `${classification.purpose} tab defaults to read-only`;
      }
    }
  }
  const hasTitle = columns.some((c) => c.semanticRole === "title");
  if (!hasTitle && role === "data") {
    const firstTextCol = columns.find(
      (c) => (c.inferredType === "text" || c.inferredType === "long_text") && c.semanticRole !== "id" && c.semanticRole !== "notes" && c.semanticRole !== "group"
    );
    if (firstTextCol) {
      firstTextCol.semanticRole = "title";
      firstTextCol.confidence = "medium";
      firstTextCol.requiresConfirmation = true;
    }
  }
  const idCol = columns.find((c) => c.semanticRole === "id");
  let suggestedIdentityStrategy = "composite_key";
  let suggestedIdentityColumns = [];
  if (idCol) {
    const seen = /* @__PURE__ */ new Set();
    let allValidAndUnique = dataRows.length > 0;
    for (const row of dataRows) {
      const val = cellText(row[idCol.colIndex]);
      if (!val || seen.has(val)) {
        allValidAndUnique = false;
        break;
      }
      seen.add(val);
    }
    if (allValidAndUnique) {
      suggestedIdentityStrategy = "column_key";
      suggestedIdentityColumns = [idCol.fieldKey];
    }
  }
  if (suggestedIdentityColumns.length === 0) {
    const keyCandidates = columns.filter(
      (c) => c.semanticRole === "group" || c.semanticRole === "subgroup" || c.semanticRole === "title"
    );
    suggestedIdentityColumns = keyCandidates.length > 0 ? keyCandidates.map((c) => c.fieldKey) : columns.slice(0, Math.min(3, columns.length)).map((c) => c.fieldKey);
  }
  const hasDoneCol = columns.some(
    (c) => c.semanticRole === "done" || c.inferredType === "checkbox" || c.inferredType === "boolean"
  );
  const groupCol = columns.find((c) => c.semanticRole === "group");
  const suggestedDefaultView = hasDoneCol ? "checklist" : groupCol ? "grouped_list" : "table";
  const lastColIdx = activeColIndices.length > 0 ? activeColIndices[activeColIndices.length - 1] : 0;
  const sampleRows = dataRows.slice(0, 5).map((r) => {
    const obj = {};
    for (const col of columns) {
      const cell = r[col.colIndex];
      obj[col.fieldKey] = cell ? cell.value : null;
    }
    return obj;
  });
  const requiresMappingConfirmation = role === "data" && (roleConfidence !== "high" || columns.some((c) => c.requiresConfirmation) || suggestedIdentityStrategy === "composite_key");
  return {
    sheetId: tab.sheetId,
    sheetTitle: tab.sheetTitle,
    role,
    roleConfidence,
    roleReason,
    detectedPurpose,
    purposeConfidence,
    requiresUserClassification,
    headerRowIndex: headerIdx0 >= 0 ? headerIdx0 + 1 : 0,
    dataStartRow: headerIdx0 >= 0 ? headerIdx0 + 2 : 1,
    dataEndColumn: colIndexToLetter2(lastColIdx),
    columns,
    suggestedIdentityStrategy,
    suggestedIdentityColumns,
    suggestedDefaultView,
    suggestedGroupByFieldKey: groupCol ? groupCol.fieldKey : null,
    requiresMappingConfirmation,
    sampleRowCount: dataRows.length,
    formulaCellCount,
    sampleRows,
    headerCandidates,
    ...dashboardReference.isRecognizedDashboard || role === "overview" || role === "summary" || role === "dashboard" ? { dashboardReference } : {}
  };
}
function detectWorkbookSchema(tabs) {
  const allKnownTabTitles = tabs.map((t) => t.sheetTitle);
  const detected = tabs.map((tab) => detectTabSchema(tab, allKnownTabTitles));
  const dataTabCount = detected.filter((t) => t.role === "data").length;
  const overviewTabCount = detected.filter(
    (t) => t.role === "overview" || t.role === "summary" || t.role === "dashboard" || t.role === "reference"
  ).length;
  const emptyTabCount = detected.filter((t) => t.role === "ignored").length;
  return {
    tabs: detected,
    dataTabCount,
    overviewTabCount,
    emptyTabCount,
    requiresUserConfirmation: true
    // Always require explicit confirmation before import
  };
}
var OVERVIEW_TAB_NAME_REGEX, URL_VALUE_REGEX, ISO_DATE_REGEX, HUMAN_DATE_REGEX, CURRENCY_TEXT_REGEX, BOOLEAN_TEXT_SET, PRIORITY_VALUE_SET, STATUS_VALUE_SET, HEADER_KEYWORD_REGEX, AGGREGATE_FORMULA_REGEX, SUMMARY_KEYWORD_REGEX, INSTRUCTIONS_KEYWORD_REGEX, METADATA_KEY_REGEX, SYLLABUS_HEADER_REGEX, REFERENCE_KEYWORD_REGEX, TOTAL_ROW_PATTERN;
var init_schemaDetector = __esm({
  "src/lib/sheetHub/schemaDetector.ts"() {
    OVERVIEW_TAB_NAME_REGEX = /\b(overview|summary|dashboard|kpi|readme|guide|index|home|instructions|about|progress|stats|statistics|tracker|syllabus[\s_-]?overview|course[\s_-]?overview)\b/i;
    URL_VALUE_REGEX = /^https?:\/\/[^\s]+$/i;
    ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?$/;
    HUMAN_DATE_REGEX = /^(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})$/;
    CURRENCY_TEXT_REGEX = /^[\s]*[₹$€£¥]\s*-?[\d,]+(?:\.\d+)?$|^-?[\d,]+(?:\.\d+)?\s*(?:INR|USD|EUR|GBP)$/i;
    BOOLEAN_TEXT_SET = /* @__PURE__ */ new Set(["true", "false", "yes", "no", "\u2611", "\u2610", "\u2713", "\u2717"]);
    PRIORITY_VALUE_SET = /* @__PURE__ */ new Set(["high", "medium", "low", "critical", "urgent", "p0", "p1", "p2", "p3"]);
    STATUS_VALUE_SET = /* @__PURE__ */ new Set([
      "todo",
      "to do",
      "pending",
      "in progress",
      "in_progress",
      "doing",
      "done",
      "completed",
      "blocked",
      "skipped",
      "review",
      "scheduled",
      "not started",
      "paid",
      "unpaid",
      "overdue"
    ]);
    HEADER_KEYWORD_REGEX = /(?:^|[\s_/\-()])(module|unit|chapter|chap|ch|topic|subtopic|section|subject|course|paper|lesson|concept|title|name|status|done|completed?|finished?|notes?|remarks?|priority|weightage|importance|date|due|links?|url|resource)(?:$|[\s_/\-()])|(টপিক|অধ্যায়|বিষয়|একক|মডিউল|সম্পন্ন|নোট|গুরুত্ব|পাঠ|শীর্ষক|विषय|अध्याय|मॉड्यूल|पूर्ण|स्थिति)/i;
    AGGREGATE_FORMULA_REGEX = /^\s*=\s*(SUM|COUNT|COUNTA|COUNTIF|COUNTIFS|AVERAGE|AVERAGEIF|SUBTOTAL|MAX|MIN|MEDIAN)\b/i;
    SUMMARY_KEYWORD_REGEX = /^(total|grand\s*total|subtotal|count|sum|average|avg|kpi|summary|overview|all|metrics|completion\s*rate)\b/i;
    INSTRUCTIONS_KEYWORD_REGEX = /\b(instructions?|guidelines?|how\s*to\s*use|readme|welcome|important\s*notes?|rules?|steps?)\b/i;
    METADATA_KEY_REGEX = /^(semester|academic\s*year|author|instructor|professor|course\s*(code|name|id)|date|created|updated|version|target\s*exam|total\s*credits?|notes?)$/i;
    SYLLABUS_HEADER_REGEX = /\b(modules?|units?|chapters?|topics?|sub[\s_-]?topics?|subtopics?|concepts?|done|status|priority|weightage|lectures?|contents?)\b/i;
    REFERENCE_KEYWORD_REGEX = /\b(reference|lookup|glossary|abbreviations?|acronyms?|definitions?|legend)\b/i;
    TOTAL_ROW_PATTERN = /^(total|grand\s*total|subtotal|count|sum|average|avg|mean|median|min|max|all|kpi|metrics?|progress|completion\s*rate|percentage)\b/i;
  }
});

// server/localXlsxParser.ts
var localXlsxParser_exports = {};
__export(localXlsxParser_exports, {
  isZipBuffer: () => isZipBuffer,
  parseLocalXlsxFixture: () => parseLocalXlsxFixture,
  parseXlsxBuffer: () => parseXlsxBuffer
});
import fs4 from "node:fs";
import zlib from "node:zlib";
function extractZipEntries(buf) {
  const entries = /* @__PURE__ */ new Map();
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 101010256) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Invalid ZIP archive: missing EOCD");
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  let pos = cdOffset;
  for (let idx = 0; idx < totalEntries; idx++) {
    if (buf.readUInt32LE(pos) !== 33639248) break;
    const compressionMethod = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString("utf-8", pos + 46, pos + 46 + nameLen);
    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compressedSlice = buf.subarray(dataStart, dataStart + compressedSize);
    const content = compressionMethod === 0 ? Buffer.from(compressedSlice) : compressionMethod === 8 ? zlib.inflateRawSync(compressedSlice) : Buffer.alloc(0);
    entries.set(name, content);
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
function decodeXmlEntities(str) {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}
function colRefToIndex0(colLetters) {
  let idx = 0;
  for (let i = 0; i < colLetters.length; i++) {
    idx = idx * 26 + (colLetters.charCodeAt(i) - 64);
  }
  return idx - 1;
}
function isZipBuffer(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 4 && buf.readUInt32LE(0) === 67324752;
}
function parseXlsxBuffer(buf) {
  if (!isZipBuffer(buf)) {
    throw new Error("Invalid XLSX archive: expected ZIP signature");
  }
  const entries = extractZipEntries(buf);
  const sharedStrings = [];
  const ssXml = entries.get("xl/sharedStrings.xml")?.toString("utf-8") || "";
  const siMatches = ssXml.match(/<si\b[^>]*>[\s\S]*?<\/si>/g) || [];
  for (const si of siMatches) {
    const parts = [];
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let m;
    while ((m = tRegex.exec(si)) !== null) {
      parts.push(decodeXmlEntities(m[1]));
    }
    sharedStrings.push(parts.join(""));
  }
  const wbXml = entries.get("xl/workbook.xml")?.toString("utf-8") || "";
  const sheetMatches = wbXml.match(/<sheet\b[^>]*\/>/g) || [];
  const tabDefs = [];
  for (const s of sheetMatches) {
    const nameMatch = s.match(/name="([^"]+)"/);
    const idMatch = s.match(/sheetId="([^"]+)"/);
    const rIdMatch = s.match(/r:id="([^"]+)"/);
    if (nameMatch && idMatch && rIdMatch) {
      tabDefs.push({
        name: decodeXmlEntities(nameMatch[1]),
        sheetId: parseInt(idMatch[1], 10),
        rId: rIdMatch[1]
      });
    }
  }
  const relsXml = entries.get("xl/_rels/workbook.xml.rels")?.toString("utf-8") || "";
  const targetMap = /* @__PURE__ */ new Map();
  const relMatches = relsXml.match(/<Relationship\b[^>]*\/>/g) || [];
  for (const r of relMatches) {
    const idMatch = r.match(/Id="([^"]+)"/);
    const targetMatch = r.match(/Target="([^"]+)"/);
    if (idMatch && targetMatch) {
      targetMap.set(idMatch[1], targetMatch[1].replace(/^\//, ""));
    }
  }
  const result = [];
  for (const tab of tabDefs) {
    const targetRel = targetMap.get(tab.rId) || `worksheets/sheet${tab.sheetId}.xml`;
    const targetPath = targetRel.startsWith("xl/") ? targetRel : `xl/${targetRel}`;
    const sheetXml = entries.get(targetPath)?.toString("utf-8");
    if (!sheetXml) continue;
    const rowMap = /* @__PURE__ */ new Map();
    const rowMatches = sheetXml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) || [];
    for (const rowXml of rowMatches) {
      const rNumMatch = rowXml.match(/r="(\d+)"/);
      if (!rNumMatch) continue;
      const rNum = parseInt(rNumMatch[1], 10);
      const cellsInRow = /* @__PURE__ */ new Map();
      const cMatches = rowXml.match(/<c\b[^>]*>[\s\S]*?<\/c>|<c\b[^>]*\/>/g) || [];
      for (const cXml of cMatches) {
        const rMatch = cXml.match(/r="([A-Z]+)(\d+)"/);
        if (!rMatch) continue;
        const colIdx = colRefToIndex0(rMatch[1]);
        const typeMatch = cXml.match(/t="([^"]+)"/);
        const cellType = typeMatch ? typeMatch[1] : "";
        const fMatch = cXml.match(/<f\b[^>]*>([\s\S]*?)<\/f>/);
        const formula = fMatch ? `=${decodeXmlEntities(fMatch[1])}` : null;
        const vMatch = cXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        const rawVal = vMatch ? decodeXmlEntities(vMatch[1]).trim() : "";
        let value = null;
        let isBooleanCell = false;
        if (cellType === "inlineStr") {
          const inlineParts = [];
          const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
          let tm;
          while ((tm = tRegex.exec(cXml)) !== null) {
            inlineParts.push(decodeXmlEntities(tm[1]));
          }
          value = inlineParts.join("");
        } else if (cellType === "b") {
          value = rawVal === "1" || rawVal.toLowerCase() === "true";
          isBooleanCell = true;
        } else if (cellType === "s") {
          const sIdx = parseInt(rawVal, 10);
          value = Number.isFinite(sIdx) && sIdx < sharedStrings.length ? sharedStrings[sIdx] : "";
        } else if (cellType === "str") {
          value = rawVal;
        } else if (rawVal !== "") {
          const num = Number(rawVal);
          value = Number.isFinite(num) ? num : rawVal;
        }
        cellsInRow.set(colIdx, {
          value,
          formattedValue: value !== null ? String(value) : null,
          formula,
          isBooleanCell
        });
      }
      rowMap.set(rNum, cellsInRow);
    }
    const maxRow = Math.max(0, ...Array.from(rowMap.keys()));
    const grid = [];
    for (let r = 1; r <= maxRow; r++) {
      const rowCells = rowMap.get(r);
      if (!rowCells) {
        grid.push([]);
        continue;
      }
      const maxCol = Math.max(0, ...Array.from(rowCells.keys()));
      const rowArr = [];
      for (let c = 0; c <= maxCol; c++) {
        rowArr.push(rowCells.get(c) || { value: null });
      }
      grid.push(rowArr);
    }
    result.push({
      sheetId: tab.sheetId,
      sheetTitle: tab.name,
      rows: grid
    });
  }
  return result;
}
function parseLocalXlsxFixture(filePath) {
  if (!fs4.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return parseXlsxBuffer(fs4.readFileSync(filePath));
}
var init_localXlsxParser = __esm({
  "server/localXlsxParser.ts"() {
  }
});

// server/serverless.ts
import express from "express";

// server/routes.ts
init_db();
init_vaultBackendService();
import { Router as Router5 } from "express";

// server/auth.ts
import crypto3 from "crypto";
import fs3 from "fs";
import path3 from "path";
var GOOGLE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
var GUEST_ID_REGEX = /^gst_[a-zA-Z0-9_-]{8,64}$/;
var PRODUCTION_PROJECT_ID2 = "focus-flow-by-atif";
var cachedProjectId = null;
var certCache = {
  certs: {},
  expiresAt: 0
};
function resolveServerFirebaseProjectId() {
  const isVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
  const vercelEnv = (process.env.VERCEL_ENV || "").trim().toLowerCase();
  const appEnv = (process.env.APP_ENV || process.env.VITE_APP_ENV || "").trim().toLowerCase();
  const nodeEnv = (process.env.NODE_ENV || "").trim().toLowerCase();
  const backendProjId = process.env.FIREBASE_PROJECT_ID;
  const frontendProjId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (backendProjId && frontendProjId && backendProjId !== frontendProjId) {
    throw new Error(
      `[CONFIG_DISAGREEMENT] Backend FIREBASE_PROJECT_ID (${backendProjId}) does not match frontend VITE_FIREBASE_PROJECT_ID (${frontendProjId})`
    );
  }
  const explicitProjId = backendProjId || frontendProjId;
  if (vercelEnv && appEnv) {
    if (vercelEnv === "preview" && appEnv === "production") {
      throw new Error(
        "[CONFIG_CONFLICT] Vercel environment ('preview') conflicts with APP_ENV ('production'). Preview deployment cannot be overridden to production."
      );
    }
    if (vercelEnv === "production" && appEnv === "preview") {
      throw new Error(
        "[CONFIG_CONFLICT] Vercel environment ('production') conflicts with APP_ENV ('preview'). Conflicting environment flags are strictly forbidden."
      );
    }
  }
  if (isVercel) {
    if (!vercelEnv || vercelEnv !== "production" && vercelEnv !== "preview" && vercelEnv !== "development") {
      throw new Error(
        `[VERCEL_ENVIRONMENT_UNRECOGNIZED] Running on Vercel deployment but VERCEL_ENV is missing or unrecognized ('${vercelEnv}'). Cannot safely determine deployment tier.`
      );
    }
    if (vercelEnv === "preview") {
      if (!explicitProjId) {
        throw new Error(
          "[PREVIEW_STAGING_CONFIG_MISSING] Vercel Preview requires explicit Staging FIREBASE_PROJECT_ID or VITE_FIREBASE_PROJECT_ID. Automatic fallback to Production Firebase is blocked."
        );
      }
      if (explicitProjId === PRODUCTION_PROJECT_ID2 || explicitProjId === "focus-flow-by-atif" || explicitProjId === "seismic-codex-m01dl" || explicitProjId === "gen-lang-client-0390447756") {
        throw new Error(
          `[STAGING_DATA_SAFETY_VIOLATION] Preview deployment cannot use Production Firebase Project (${explicitProjId}). Preview must use a dedicated Staging Firebase Project.`
        );
      }
      return explicitProjId;
    }
    if (vercelEnv === "production") {
      if (explicitProjId) return explicitProjId;
      return PRODUCTION_PROJECT_ID2;
    }
    if (vercelEnv === "development" && explicitProjId) {
      return explicitProjId;
    }
  }
  if (appEnv === "preview") {
    if (!explicitProjId) {
      throw new Error(
        "[PREVIEW_STAGING_CONFIG_MISSING] Preview requires explicit Staging FIREBASE_PROJECT_ID or VITE_FIREBASE_PROJECT_ID. Automatic fallback to Production Firebase is blocked."
      );
    }
    if (explicitProjId === PRODUCTION_PROJECT_ID2 || explicitProjId === "focus-flow-by-atif" || explicitProjId === "seismic-codex-m01dl" || explicitProjId === "gen-lang-client-0390447756") {
      throw new Error(
        `[STAGING_DATA_SAFETY_VIOLATION] Preview deployment cannot use Production Firebase Project (${explicitProjId}). Preview must use a dedicated Staging Firebase Project.`
      );
    }
    return explicitProjId;
  }
  if (explicitProjId) {
    return explicitProjId;
  }
  if (nodeEnv === "test") {
    return "test-rules-project";
  }
  try {
    const cfgPath = path3.resolve(process.cwd(), "firebase-applet-config.json");
    if (fs3.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs3.readFileSync(cfgPath, "utf-8"));
      if (parsed.projectId) {
        return parsed.projectId;
      }
    }
  } catch {
  }
  return PRODUCTION_PROJECT_ID2;
}
function resolveFirebaseProjectId() {
  if (cachedProjectId && process.env.NODE_ENV !== "test") return cachedProjectId;
  const resolved = resolveServerFirebaseProjectId();
  if (process.env.NODE_ENV !== "test") {
    cachedProjectId = resolved;
  }
  return resolved;
}
async function getGooglePublicCerts(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && Object.keys(certCache.certs).length > 0 && now < certCache.expiresAt) {
    return certCache.certs;
  }
  const response = await fetch(GOOGLE_CERTS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Google public certificates (${response.status})`);
  }
  const certs = await response.json();
  const cacheControl = response.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const ttlMs = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1])) * 1e3 : 3600 * 1e3;
  certCache = {
    certs,
    expiresAt: now + ttlMs
  };
  return certs;
}
function decodeBase64UrlJson(segment) {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
}
function decodeBase64UrlBuffer(segment) {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, "=");
  return Buffer.from(padded, "base64");
}
async function verifyFirebaseIdToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed JWT");
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const header = decodeBase64UrlJson(headerB64);
  const payload = decodeBase64UrlJson(payloadB64);
  const isProduction = process.env.NODE_ENV === "production";
  const isEmulatorEnv = Boolean(process.env.FIRESTORE_EMULATOR_HOST) || Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) || process.env.NODE_ENV === "test" || process.env.ALLOW_EMULATOR_AUTH === "true";
  if (header.alg === "none" && !sigB64) {
    if (isProduction) {
      throw new Error("Unsigned tokens are strictly forbidden in production");
    }
    if (!isEmulatorEnv) {
      throw new Error("Emulator tokens are only permitted when Firebase emulator host is configured");
    }
    const projectId2 = resolveFirebaseProjectId();
    const nowSec2 = Math.floor(Date.now() / 1e3);
    const validAuds = /* @__PURE__ */ new Set([
      projectId2,
      "test-rules-project",
      "focus-flow-by-atif",
      "seismic-codex-m01dl"
    ]);
    if (payload.aud && !validAuds.has(payload.aud)) {
      throw new Error("Token audience mismatch");
    }
    if (!payload.sub || typeof payload.sub !== "string" || payload.sub.length > 128) {
      throw new Error("Invalid token subject");
    }
    if (typeof payload.exp === "number" && payload.exp <= nowSec2 - 30) {
      throw new Error("Token expired");
    }
    return {
      userId: payload.sub,
      email: typeof payload.email === "string" ? payload.email : void 0,
      name: typeof payload.name === "string" ? payload.name : void 0,
      avatarUrl: typeof payload.picture === "string" ? payload.picture : void 0,
      isGuest: payload.sub.startsWith("gst_") || Boolean(payload.isGuest)
    };
  }
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Unsupported JWT algorithm or missing key ID");
  }
  let certs = await getGooglePublicCerts(false);
  let pem = certs[header.kid];
  if (!pem) {
    certs = await getGooglePublicCerts(true);
    pem = certs[header.kid];
  }
  if (!pem) {
    throw new Error("Signing certificate not found for token key ID");
  }
  const verifier = crypto3.createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const signatureValid = verifier.verify(pem, decodeBase64UrlBuffer(sigB64));
  if (!signatureValid) {
    throw new Error("Invalid JWT signature");
  }
  const projectId = resolveFirebaseProjectId();
  const nowSec = Math.floor(Date.now() / 1e3);
  if (payload.aud !== projectId) {
    throw new Error("Token audience mismatch");
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error("Token issuer mismatch");
  }
  if (!payload.sub || typeof payload.sub !== "string" || payload.sub.length > 128) {
    throw new Error("Invalid token subject");
  }
  if (typeof payload.exp !== "number" || payload.exp <= nowSec - 30) {
    throw new Error("Token expired");
  }
  if (typeof payload.iat !== "number" || payload.iat > nowSec + 300) {
    throw new Error("Token issued in the future");
  }
  return {
    userId: payload.sub,
    email: typeof payload.email === "string" ? payload.email : void 0,
    name: typeof payload.name === "string" ? payload.name : void 0,
    avatarUrl: typeof payload.picture === "string" ? payload.picture : void 0,
    isGuest: false
  };
}
async function requireUserContext(req, res, next) {
  if (req.auth) {
    next();
    return;
  }
  const isProduction = process.env.NODE_ENV === "production";
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      res.status(401).json({ error: "Missing authentication bearer token", code: "AUTH_REQUIRED" });
      return;
    }
    try {
      const verified = await verifyFirebaseIdToken(token);
      req.auth = verified;
      const claimedUid = req.headers["x-user-id"];
      if (typeof claimedUid === "string" && claimedUid.trim() && claimedUid.trim() !== verified.userId) {
        res.status(403).json({ error: "Tenant isolation violation: x-user-id does not match verified token subject" });
        return;
      }
      next();
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unauthorized";
      res.status(401).json({ error: `Authentication failed: ${message}`, code: "AUTH_REQUIRED" });
      return;
    }
  }
  const isPublicSheetHubRequest = req.path === "/sheet-hub/sample-semester3" || req.path === "/sheet-hub/sample-semester3/" || (req.path === "/sheet-hub/inspect" || req.path === "/sheet-hub/inspect/") && req.body?.publicAccess === true || (req.path === "/sheet-hub/pull" || req.path === "/sheet-hub/pull/") && req.body?.publicAccess === true;
  if (isPublicSheetHubRequest) {
    req.auth = {
      userId: "usr_guest",
      email: "guest@focusflow.local",
      isGuest: true
    };
    next();
    return;
  }
  if (process.env.REQUIRE_AUTH === "true" || isProduction && process.env.ALLOW_GUEST !== "true") {
    res.status(401).json({ error: "Authentication required", code: "AUTH_REQUIRED" });
    return;
  }
  const demoSessionHeader = req.headers["x-demo-session"];
  let demoSessionId;
  if (typeof demoSessionHeader === "string" && GUEST_ID_REGEX.test(demoSessionHeader.trim())) {
    demoSessionId = demoSessionHeader.trim();
  } else if (!isProduction && process.env.DEMO_MODE === "shared") {
    demoSessionId = "usr_atif_default";
  } else {
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || "localhost";
    const clientUa = req.headers["user-agent"] || "generic";
    const hash = crypto3.createHash("sha256").update(`${clientIp}:${clientUa}`).digest("hex").slice(0, 16);
    demoSessionId = `gst_${hash}`;
  }
  req.auth = {
    userId: demoSessionId,
    isGuest: true
  };
  next();
}

// server/security.ts
var rateLimitMap = /* @__PURE__ */ new Map();
var cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 3e5);
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}
function configureTrustProxy(app2, trustProxyEnv) {
  if (!trustProxyEnv || trustProxyEnv.trim() === "" || trustProxyEnv === "false" || trustProxyEnv === "0") {
    app2.set("trust proxy", false);
    return false;
  }
  const trimmed = trustProxyEnv.trim();
  if (trimmed.toLowerCase() === "true") {
    app2.set("trust proxy", true);
    return true;
  }
  if (/^[+-]?\d+$/.test(trimmed)) {
    const hops = parseInt(trimmed, 10);
    if (!isNaN(hops) && hops > 0) {
      app2.set("trust proxy", hops);
      return hops;
    }
    app2.set("trust proxy", false);
    return false;
  }
  try {
    app2.set("trust proxy", trimmed);
    return trimmed;
  } catch (err) {
    console.warn(
      `[Security] Warning: Invalid TRUST_PROXY configuration "${trimmed}" (${err instanceof Error ? err.message : String(err)}). Failing safely to trust proxy = false.`
    );
    app2.set("trust proxy", false);
    return false;
  }
}
function resolveClientIp(req) {
  const trustProxySetting = req.app?.get ? req.app.get("trust proxy") : false;
  const isProxyTrusted = Boolean(trustProxySetting);
  let rawIp;
  if (isProxyTrusted && req.ip) {
    rawIp = req.ip;
  } else {
    rawIp = req.socket?.remoteAddress;
  }
  if (!rawIp) {
    rawIp = req.ip || "unknown_client";
  }
  if (rawIp.startsWith("::ffff:")) {
    rawIp = rawIp.slice(7);
  }
  return rawIp;
}
function rateLimiter(options = {}) {
  const windowMs = options.windowMs || 6e4;
  const maxRequests = options.maxRequests || 300;
  const message = options.message || "Too many requests. Please slow down and try again.";
  return (req, res, next) => {
    const authUser = req.auth?.userId;
    const clientIp = resolveClientIp(req);
    const key = authUser ? `usr:${authUser}:${req.method}` : `ip:${clientIp}:${req.method}`;
    const now = Date.now();
    let record = rateLimitMap.get(key);
    if (!record || now > record.resetAt) {
      record = {
        count: 1,
        resetAt: now + windowMs
      };
      rateLimitMap.set(key, record);
    } else {
      record.count += 1;
    }
    const remaining = Math.max(0, maxRequests - record.count);
    const resetSeconds = Math.ceil((record.resetAt - now) / 1e3);
    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", resetSeconds);
    if (record.count > maxRequests) {
      res.status(429).json({
        error: message,
        retryAfterSeconds: resetSeconds
      });
      return;
    }
    next();
  };
}
function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}
function sanitizeLogData(data) {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(sanitizeLogData);
  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes("token") || lowerKey.includes("password") || lowerKey.includes("secret") || lowerKey.includes("authorization") || lowerKey.includes("auth") || lowerKey.includes("apikey") || lowerKey.includes("key") || lowerKey.includes("card") || lowerKey.includes("creditcard") || lowerKey.includes("credential")) {
      clean[key] = "[REDACTED_SECRET]";
    } else if (typeof value === "object" && value !== null) {
      clean[key] = sanitizeLogData(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}
var sanitizeForLogging = sanitizeLogData;
function corsHandler(req, res, next) {
  const origin = req.headers.origin;
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
  const appUrl = process.env.APP_URL;
  const requestHost = req.headers.host;
  let sameHostOrigin = false;
  if (origin && requestHost) {
    try {
      sameHostOrigin = new URL(origin).host === requestHost;
    } catch {
      sameHostOrigin = false;
    }
  }
  let isAllowed = false;
  if (!origin || sameHostOrigin) {
    isAllowed = true;
  } else if (allowedOriginsEnv) {
    const list = allowedOriginsEnv.split(",").map((o) => o.trim());
    isAllowed = list.includes(origin) || list.includes("*");
  } else if (appUrl && (origin === appUrl || origin === new URL(appUrl).origin)) {
    isAllowed = true;
  } else if (process.env.NODE_ENV !== "production") {
    isAllowed = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }
  if (origin && isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-demo-session, x-user-id, x-google-access-token, X-CSRF-Token, X-Requested-With, Accept, Accept-Version"
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}
function errorHandler(err, req, res, _next) {
  const sanitized = sanitizeLogData(
    err instanceof Error ? { message: err.message, stack: err.stack } : { error: err }
  );
  console.error("[API Error]", JSON.stringify(sanitized));
  if (res.headersSent) return;
  const isProd = process.env.NODE_ENV === "production";
  const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
  res.status(500).json({
    error: isProd ? "Internal Server Error" : errorMessage,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
}

// server/routes.ts
init_dateTime2();

// server/validation.ts
init_dateTime2();
var ALLOWED_CURRENCIES = ["INR", "USD", "EUR", "GBP"];
var ALLOWED_THEMES = ["light", "dark", "system"];
var ALLOWED_TASK_PRIORITIES = ["low", "medium", "high"];
var ALLOWED_TASK_STATUSES = ["todo", "in_progress", "completed"];
var ALLOWED_TASK_RECURRENCES = ["none", "daily", "weekly", "monthly"];
var ALLOWED_FOCUS_MODES = ["work", "short_break", "long_break"];
var ALLOWED_PAYMENT_METHODS = [
  "credit_card",
  "debit_card",
  "upi_bank",
  "cash",
  "other"
];
var ALLOWED_RECURRENCES = ["monthly", "quarterly", "yearly"];
var ALLOWED_CATEGORY_TYPES = ["fixed", "variable", "both"];
var ALLOWED_STUDY_PRIORITIES = ["High", "Medium", "Low"];
var ALLOWED_REVISION_DIFFICULTIES = ["easy", "medium", "hard"];
var ALLOWED_REVISION_STATUSES = ["scheduled", "due", "overdue", "mastered"];
var ALLOWED_MISTAKE_SEVERITIES = ["High", "Medium", "Low"];
function parsePositiveInt(value, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (value === null || value === void 0 || typeof value === "boolean") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num)) return null;
  if (num < min || num > max) return null;
  return num;
}
function parseNonNegativeInt(value, max = Number.MAX_SAFE_INTEGER) {
  return parsePositiveInt(value, 0, max);
}
function parseNonEmptyString(value, maxLen = 500) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}
function parseOptionalString(value, maxLen = 2e3) {
  if (value === void 0 || value === null) return "";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > maxLen) return null;
  return trimmed;
}
function parseIsoDate(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = /* @__PURE__ */ new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== trimmed) return null;
  return trimmed;
}
function parseEnum(value, allowed) {
  if (typeof value !== "string") return null;
  return allowed.includes(value) ? value : null;
}
function parseSubtasks(raw) {
  if (!Array.isArray(raw)) return null;
  if (raw.length > 50) return null;
  const parsed = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const rec = item;
    const title = parseNonEmptyString(rec.title, 200);
    if (!title) return null;
    const id = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim().slice(0, 80) : `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    parsed.push({
      id,
      title,
      done: Boolean(rec.done)
    });
  }
  return parsed;
}
function computeNextRecurrenceDueDate(currentDueDate, recurrence) {
  const baseStr = currentDueDate && parseIsoDate(currentDueDate) ? currentDueDate : getTodayDateString(DEFAULT_TIMEZONE);
  const d = /* @__PURE__ */ new Date(`${baseStr}T00:00:00.000Z`);
  if (recurrence === "daily") {
    d.setUTCDate(d.getUTCDate() + 1);
  } else if (recurrence === "weekly") {
    d.setUTCDate(d.getUTCDate() + 7);
  } else {
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}
function calculateBoundedStreakDays(sessions, timezoneOrRefDate = DEFAULT_TIMEZONE, referenceDate = /* @__PURE__ */ new Date()) {
  const tz = typeof timezoneOrRefDate === "string" ? timezoneOrRefDate : DEFAULT_TIMEZONE;
  const refDate = timezoneOrRefDate instanceof Date ? timezoneOrRefDate : referenceDate;
  return calculateFocusStreakDays(sessions, tz, refDate);
}
function computeBestStreakDays2(sessions, timezone = DEFAULT_TIMEZONE) {
  return computeBestStreakDays(sessions, timezone);
}

// src/lib/sheetsSpec.ts
init_dateTime();
var WORKSHEET_NAMES = [
  // Executive Dashboards (Flagship First 3 Sheets)
  "Executive_Dashboard",
  "Finance_Dashboard",
  "Productivity_Dashboard",
  // Productivity Division
  "Focus_Sessions",
  "Focus_Daily",
  "Focus_Weekly",
  "Focus_Monthly",
  "Tasks",
  "Task_Analytics",
  "Productivity_Goals",
  // Finance Division
  "Income",
  "Fixed_Expenses",
  "Variable_Expenses",
  "Bills_Payments",
  "Budgets",
  "Savings_Goals",
  "Finance_Daily",
  "Finance_Weekly",
  "Finance_Monthly",
  // System & Governance Division
  "Sync_Control",
  "Sync_Error_Log",
  "Data_Dictionary",
  "Settings"
];
function isDashboardWorksheet(name) {
  return name === "Executive_Dashboard" || name === "Finance_Dashboard" || name === "Productivity_Dashboard";
}
function getSheetId(name) {
  return 100 + WORKSHEET_NAMES.indexOf(name);
}
function colIndexToLetter(columnNumber) {
  let n = Math.max(1, Math.floor(columnNumber));
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}
var WORKSHEET_HEADERS = {
  Executive_Dashboard: [
    "Metric Category",
    "KPI Description",
    "Current Value",
    "Benchmark / Target",
    "Frequency",
    "Operational Notes"
  ],
  Finance_Dashboard: [
    "Financial Metric",
    "Amount (\u20B9) / Rate",
    "Benchmark / Target",
    "Status",
    "Frequency",
    "Operational Notes"
  ],
  Productivity_Dashboard: [
    "Productivity Metric",
    "Quantity / Duration",
    "Target / Velocity",
    "Status",
    "Cadence",
    "Operational Notes"
  ],
  Focus_Sessions: [
    "Session ID",
    "Date",
    "Session Mode",
    "Duration (Min)",
    "Task Title",
    "Completed",
    "Started At",
    "Ended At"
  ],
  Focus_Daily: ["Date", "Day", "Focus Minutes", "Focus Hours", "Completed Sessions"],
  Focus_Weekly: [
    "Week Range",
    "Productive Hours",
    "Average Daily Focus (Min)",
    "Completed Cycles"
  ],
  Focus_Monthly: ["Month", "Total Focus Hours", "Completed Sessions", "Streak Record (Days)"],
  Tasks: [
    "Task ID",
    "Title",
    "Priority",
    "Status",
    "Estimated Pomodoros",
    "Completed Pomodoros",
    "Due Date",
    "Category",
    "Recurrence",
    "Created At"
  ],
  Task_Analytics: [
    "Analysis Metric",
    "Current Value",
    "Target / Standard",
    "Status",
    "Insights & Recommendations"
  ],
  Productivity_Goals: [
    "Goal Metric",
    "Target Level",
    "Current Achieved",
    "Progress (%)",
    "Cadence",
    "Status"
  ],
  Income: ["Income ID", "Date", "Source / Client", "Category", "Amount (\u20B9)", "Notes"],
  Fixed_Expenses: [
    "Plan ID",
    "Plan Name",
    "Category",
    "Monthly Outflow (\u20B9)",
    "Recurrence",
    "Due Day",
    "Active Status",
    "Notes"
  ],
  Variable_Expenses: [
    "Expense ID",
    "Date",
    "Description",
    "Category",
    "Amount (\u20B9)",
    "Payment Method",
    "Notes"
  ],
  Bills_Payments: [
    "Bill ID",
    "Due Date",
    "Bill Name",
    "Category",
    "Amount (\u20B9)",
    "Payment Status",
    "Payment Date",
    "Payment Method",
    "Notes"
  ],
  Budgets: [
    "Envelope ID",
    "Category",
    "Allocated Amount (\u20B9)",
    "Spent Amount (\u20B9)",
    "Remaining Balance (\u20B9)",
    "Utilization (%)",
    "Health Status"
  ],
  Savings_Goals: [
    "Goal ID",
    "Goal Name",
    "Target Amount (\u20B9)",
    "Current Saved (\u20B9)",
    "Remaining (\u20B9)",
    "Target Date",
    "Progress (%)",
    "Status"
  ],
  Finance_Daily: ["Date", "Income (\u20B9)", "Expenses (\u20B9)", "Net Cashflow (\u20B9)"],
  Finance_Weekly: [
    "Week",
    "Income (\u20B9)",
    "Fixed Outflow (\u20B9)",
    "Variable Outflow (\u20B9)",
    "Total Expenses (\u20B9)",
    "Net Savings (\u20B9)"
  ],
  Finance_Monthly: [
    "Month",
    "Total Income (\u20B9)",
    "Fixed Expenses (\u20B9)",
    "Variable Expenses (\u20B9)",
    "Total Expenses (\u20B9)",
    "Remaining Balance (\u20B9)",
    "Savings Rate (%)"
  ],
  Sync_Control: [
    "System Component",
    "Status / Metric",
    "Operational Value",
    "Architecture Specification"
  ],
  Sync_Error_Log: [
    "Log ID",
    "Timestamp",
    "Operation Type",
    "Entity Type",
    "Record ID",
    "Retry Count",
    "Error Details",
    "Recovery Status"
  ],
  Data_Dictionary: [
    "Worksheet Name",
    "Field / Column Name",
    "Data Type",
    "Formatting Standard",
    "Validation Rule",
    "Calculation / Derivation"
  ],
  Settings: [
    "Configuration Parameter",
    "Active Value",
    "Default Value",
    "Description & Scope"
  ]
};
var SHEET_COLUMN_FORMATS = {
  Executive_Dashboard: {
    currencyCols: [],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [0, 3, 4],
    rightCols: [2]
  },
  Finance_Dashboard: {
    currencyCols: [1],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [3, 4],
    rightCols: [1, 2]
  },
  Productivity_Dashboard: {
    currencyCols: [],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [3, 4],
    rightCols: [1, 2]
  },
  Focus_Sessions: {
    currencyCols: [],
    percentCols: [],
    integerCols: [3],
    decimalCols: [],
    centerCols: [1, 2, 5],
    rightCols: [3]
  },
  Focus_Daily: {
    currencyCols: [],
    percentCols: [],
    integerCols: [2, 4],
    decimalCols: [3],
    centerCols: [0, 1],
    rightCols: [2, 3, 4]
  },
  Focus_Weekly: {
    currencyCols: [],
    percentCols: [],
    integerCols: [2, 3],
    decimalCols: [1],
    centerCols: [],
    rightCols: [1, 2, 3]
  },
  Focus_Monthly: {
    currencyCols: [],
    percentCols: [],
    integerCols: [2, 3],
    decimalCols: [1],
    centerCols: [],
    rightCols: [1, 2, 3]
  },
  Tasks: {
    currencyCols: [],
    percentCols: [],
    integerCols: [4, 5],
    decimalCols: [],
    centerCols: [2, 3, 6, 8],
    rightCols: [4, 5]
  },
  Task_Analytics: {
    currencyCols: [],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [2, 3],
    rightCols: [1]
  },
  Productivity_Goals: {
    currencyCols: [],
    percentCols: [3],
    integerCols: [],
    decimalCols: [],
    centerCols: [4, 5],
    rightCols: [1, 2, 3]
  },
  Income: {
    currencyCols: [4],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [1],
    rightCols: [4]
  },
  Fixed_Expenses: {
    currencyCols: [3],
    percentCols: [],
    integerCols: [5],
    decimalCols: [],
    centerCols: [4, 6],
    rightCols: [3, 5]
  },
  Variable_Expenses: {
    currencyCols: [4],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [1, 5],
    rightCols: [4]
  },
  Bills_Payments: {
    currencyCols: [4],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [1, 5, 6, 7],
    rightCols: [4]
  },
  Budgets: {
    currencyCols: [2, 3, 4],
    percentCols: [5],
    integerCols: [],
    decimalCols: [],
    centerCols: [6],
    rightCols: [2, 3, 4, 5]
  },
  Savings_Goals: {
    currencyCols: [2, 3, 4],
    percentCols: [6],
    integerCols: [],
    decimalCols: [],
    centerCols: [5, 7],
    rightCols: [2, 3, 4, 6]
  },
  Finance_Daily: {
    currencyCols: [1, 2, 3],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [0],
    rightCols: [1, 2, 3]
  },
  Finance_Weekly: {
    currencyCols: [1, 2, 3, 4, 5],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [],
    rightCols: [1, 2, 3, 4, 5]
  },
  Finance_Monthly: {
    currencyCols: [1, 2, 3, 4, 5],
    percentCols: [6],
    integerCols: [],
    decimalCols: [],
    centerCols: [],
    rightCols: [1, 2, 3, 4, 5, 6]
  },
  Sync_Control: {
    currencyCols: [],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [1],
    rightCols: []
  },
  Sync_Error_Log: {
    currencyCols: [],
    percentCols: [],
    integerCols: [5],
    decimalCols: [],
    centerCols: [1, 2, 7],
    rightCols: [5]
  },
  Data_Dictionary: {
    currencyCols: [],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [2, 3],
    rightCols: []
  },
  Settings: {
    currencyCols: [],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [1, 2],
    rightCols: []
  }
};
function formatPaymentMethodLabel(method, isPaid = false) {
  if (!isPaid && !method) return "\u2014";
  const normalized = (method || "").trim().toLowerCase();
  if (normalized === "cash") return "Cash";
  if (normalized === "card") return "Card";
  if (normalized === "upi_bank" || normalized === "upi") return "UPI / Bank";
  if (normalized === "auto_debit") return "Auto-Debit";
  if (normalized) return normalized.replace(/_/g, " ").toUpperCase();
  return isPaid ? "UPI / Bank" : "\u2014";
}
function computeBestStreakFromSessions(sessions) {
  const dates = Array.from(
    new Set(
      sessions.filter((s) => s && s.completed && s.mode === "work" && typeof s.startedAt === "string").map((s) => s.startedAt.slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    )
  ).sort();
  if (dates.length === 0) return 0;
  let best = 1;
  let current = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = /* @__PURE__ */ new Date(`${dates[i - 1]}T00:00:00.000Z`);
    const next = /* @__PURE__ */ new Date(`${dates[i]}T00:00:00.000Z`);
    const diff = Math.round((next.getTime() - prev.getTime()) / 864e5);
    if (diff === 1) {
      current++;
      if (current > best) best = current;
    } else if (diff > 1) {
      current = 1;
    }
  }
  return best;
}
function buildInitialHeaderValueUpdates() {
  return WORKSHEET_NAMES.map((name) => {
    const headers = WORKSHEET_HEADERS[name];
    const lastColLetter = colIndexToLetter(Math.max(headers.length, 6));
    if (isDashboardWorksheet(name)) {
      return {
        range: `${name}!A1:${lastColLetter}3`,
        values: [
          [
            `FOCUSFLOW & FINANCE \u2014 ${name.replace("_", " ").toUpperCase()}`,
            "Status:",
            "INITIALIZING...",
            "Currency:",
            "INR (\u20B9)",
            "READY"
          ],
          [
            "Strategic intelligence dashboard \u2014 synchronized via Cloud Firestore server backend.",
            "",
            "",
            "",
            "",
            ""
          ],
          headers
        ]
      };
    }
    return {
      range: `${name}!A1:${lastColLetter}1`,
      values: [headers]
    };
  });
}
function buildDynamicClearRanges(sheetsMeta) {
  const byTitle = /* @__PURE__ */ new Map();
  for (const s of sheetsMeta) {
    const title = s.properties?.title;
    if (title) byTitle.set(title, s);
  }
  const ranges = [];
  for (const name of WORKSHEET_NAMES) {
    if (isDashboardWorksheet(name)) continue;
    const meta = byTitle.get(name);
    if (!meta) continue;
    const headers = WORKSHEET_HEADERS[name];
    const rowCount = Math.max(2, meta.properties?.gridProperties?.rowCount ?? 500);
    const colCount = Math.max(
      headers.length,
      meta.properties?.gridProperties?.columnCount ?? headers.length
    );
    const endCol = colIndexToLetter(colCount);
    ranges.push(`${name}!A2:${endCol}${rowCount}`);
  }
  return ranges;
}
function buildCreateStylingRequests() {
  const requests = [];
  WORKSHEET_NAMES.forEach((name) => {
    const sheetId = getSheetId(name);
    const headers = WORKSHEET_HEADERS[name];
    const spec = SHEET_COLUMN_FORMATS[name];
    const isDashboard = isDashboardWorksheet(name);
    const headerRowIndex = isDashboard ? 2 : 0;
    const dataStartRowIndex = headerRowIndex + 1;
    const dataEndRowIndex = 500;
    if (isDashboard) {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: Math.max(headers.length, 6)
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.059, green: 0.09, blue: 0.165 },
              verticalAlignment: "MIDDLE",
              textFormat: {
                foregroundColor: { red: 0.94, green: 0.96, blue: 0.99 },
                fontSize: 11,
                bold: true,
                fontFamily: "Roboto"
              },
              padding: { top: 6, bottom: 6, left: 12, right: 12 }
            }
          },
          fields: "userEnteredFormat(backgroundColor,verticalAlignment,textFormat,padding)"
        }
      });
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: 2,
            startColumnIndex: 0,
            endColumnIndex: Math.max(headers.length, 6)
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.118, green: 0.161, blue: 0.235 },
              verticalAlignment: "MIDDLE",
              textFormat: {
                foregroundColor: { red: 0.58, green: 0.64, blue: 0.72 },
                fontSize: 9,
                italic: true,
                fontFamily: "Roboto"
              },
              padding: { top: 3, bottom: 3, left: 12, right: 12 }
            }
          },
          fields: "userEnteredFormat(backgroundColor,verticalAlignment,textFormat,padding)"
        }
      });
    }
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: headerRowIndex,
          endRowIndex: headerRowIndex + 1,
          startColumnIndex: 0,
          endColumnIndex: headers.length
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.078, green: 0.118, blue: 0.22 },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
            textFormat: {
              foregroundColor: { red: 1, green: 1, blue: 1 },
              fontSize: 10,
              bold: true,
              fontFamily: "Roboto"
            },
            padding: { top: 6, bottom: 6, left: 10, right: 10 }
          }
        },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)"
      }
    });
    requests.push(
      {
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: headerRowIndex,
            endIndex: dataStartRowIndex
          },
          properties: { pixelSize: 36 },
          fields: "pixelSize"
        }
      },
      {
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: dataStartRowIndex,
            endIndex: dataEndRowIndex
          },
          properties: { pixelSize: 26 },
          fields: "pixelSize"
        }
      }
    );
    requests.push({
      addBanding: {
        bandedRange: {
          range: {
            sheetId,
            startRowIndex: dataStartRowIndex,
            endRowIndex: dataEndRowIndex,
            startColumnIndex: 0,
            endColumnIndex: headers.length
          },
          rowProperties: {
            firstBandColor: { red: 1, green: 1, blue: 1 },
            secondBandColor: { red: 0.973, green: 0.98, blue: 0.988 }
          }
        }
      }
    });
    const lightGrayBorder = {
      style: "SOLID",
      width: 1,
      color: { red: 0.886, green: 0.91, blue: 0.941 }
    };
    requests.push({
      updateBorders: {
        range: {
          sheetId,
          startRowIndex: headerRowIndex,
          endRowIndex: dataEndRowIndex,
          startColumnIndex: 0,
          endColumnIndex: headers.length
        },
        top: lightGrayBorder,
        bottom: lightGrayBorder,
        left: lightGrayBorder,
        right: lightGrayBorder,
        innerHorizontal: lightGrayBorder,
        innerVertical: lightGrayBorder
      }
    });
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: dataStartRowIndex,
          endRowIndex: dataEndRowIndex,
          startColumnIndex: 0,
          endColumnIndex: headers.length
        },
        cell: {
          userEnteredFormat: {
            verticalAlignment: "MIDDLE",
            textFormat: {
              fontFamily: "Roboto",
              fontSize: 9,
              foregroundColor: { red: 0.12, green: 0.16, blue: 0.22 }
            },
            padding: { top: 2, bottom: 2, left: 8, right: 8 }
          }
        },
        fields: "userEnteredFormat(verticalAlignment,textFormat,padding)"
      }
    });
    spec.currencyCols.forEach((colIndex) => {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: dataStartRowIndex,
            endRowIndex: dataEndRowIndex,
            startColumnIndex: colIndex,
            endColumnIndex: colIndex + 1
          },
          cell: {
            userEnteredFormat: {
              numberFormat: {
                type: "CURRENCY",
                pattern: '"\u20B9"#,##0.00'
              }
            }
          },
          fields: "userEnteredFormat.numberFormat"
        }
      });
    });
    spec.percentCols.forEach((colIndex) => {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: dataStartRowIndex,
            endRowIndex: dataEndRowIndex,
            startColumnIndex: colIndex,
            endColumnIndex: colIndex + 1
          },
          cell: {
            userEnteredFormat: {
              numberFormat: {
                type: "PERCENT",
                pattern: "0.0%"
              }
            }
          },
          fields: "userEnteredFormat.numberFormat"
        }
      });
    });
    spec.integerCols.forEach((colIndex) => {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: dataStartRowIndex,
            endRowIndex: dataEndRowIndex,
            startColumnIndex: colIndex,
            endColumnIndex: colIndex + 1
          },
          cell: {
            userEnteredFormat: {
              numberFormat: {
                type: "NUMBER",
                pattern: "#,##0"
              }
            }
          },
          fields: "userEnteredFormat.numberFormat"
        }
      });
    });
    spec.decimalCols.forEach((colIndex) => {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: dataStartRowIndex,
            endRowIndex: dataEndRowIndex,
            startColumnIndex: colIndex,
            endColumnIndex: colIndex + 1
          },
          cell: {
            userEnteredFormat: {
              numberFormat: {
                type: "NUMBER",
                pattern: "#,##0.00"
              }
            }
          },
          fields: "userEnteredFormat.numberFormat"
        }
      });
    });
    spec.centerCols.forEach((colIndex) => {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: dataStartRowIndex,
            endRowIndex: dataEndRowIndex,
            startColumnIndex: colIndex,
            endColumnIndex: colIndex + 1
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: "CENTER"
            }
          },
          fields: "userEnteredFormat.horizontalAlignment"
        }
      });
    });
    spec.rightCols.forEach((colIndex) => {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: dataStartRowIndex,
            endRowIndex: dataEndRowIndex,
            startColumnIndex: colIndex,
            endColumnIndex: colIndex + 1
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: "RIGHT"
            }
          },
          fields: "userEnteredFormat.horizontalAlignment"
        }
      });
    });
    if (name === "Focus_Sessions" || name === "Tasks" || name === "Income" || name === "Variable_Expenses" || name === "Fixed_Expenses" || name === "Bills_Payments" || name === "Budgets" || name === "Savings_Goals") {
      requests.push({
        setBasicFilter: {
          filter: {
            range: {
              sheetId,
              startRowIndex: headerRowIndex,
              endRowIndex: dataEndRowIndex,
              startColumnIndex: 0,
              endColumnIndex: headers.length
            }
          }
        }
      });
    }
  });
  const addDropdown = (sheet, col, values) => {
    requests.push({
      setDataValidation: {
        range: {
          sheetId: getSheetId(sheet),
          startRowIndex: 1,
          endRowIndex: 500,
          startColumnIndex: col,
          endColumnIndex: col + 1
        },
        rule: {
          condition: {
            type: "ONE_OF_LIST",
            values: values.map((v) => ({ userEnteredValue: v }))
          },
          showCustomUi: true,
          strict: false
        }
      }
    });
  };
  addDropdown("Bills_Payments", 5, ["PAID", "UNPAID", "OVERDUE"]);
  addDropdown("Bills_Payments", 7, ["UPI / Bank", "Card", "Cash", "Auto-Debit", "Other"]);
  addDropdown("Tasks", 2, ["high", "medium", "low"]);
  addDropdown("Tasks", 3, ["todo", "in_progress", "completed"]);
  addDropdown("Tasks", 8, ["none", "daily", "weekly", "monthly"]);
  addDropdown("Fixed_Expenses", 4, ["MONTHLY", "QUARTERLY", "YEARLY"]);
  addDropdown("Fixed_Expenses", 6, ["ACTIVE", "INACTIVE"]);
  addDropdown("Budgets", 6, ["ON_TRACK", "WARNING", "OVERSPENT"]);
  const billsSheetId = getSheetId("Bills_Payments");
  requests.push(
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: billsSheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 }],
          booleanRule: {
            condition: { type: "TEXT_EQ", values: [{ userEnteredValue: "PAID" }] },
            format: {
              backgroundColor: { red: 0.902, green: 0.969, blue: 0.925 },
              textFormat: { foregroundColor: { red: 0.02, green: 0.478, blue: 0.239 }, bold: true }
            }
          }
        },
        index: 0
      }
    },
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: billsSheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 }],
          booleanRule: {
            condition: { type: "TEXT_EQ", values: [{ userEnteredValue: "UNPAID" }] },
            format: {
              backgroundColor: { red: 0.996, green: 0.953, blue: 0.78 },
              textFormat: { foregroundColor: { red: 0.706, green: 0.325, blue: 0.035 }, bold: true }
            }
          }
        },
        index: 1
      }
    },
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: billsSheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 }],
          booleanRule: {
            condition: { type: "TEXT_EQ", values: [{ userEnteredValue: "OVERDUE" }] },
            format: {
              backgroundColor: { red: 0.996, green: 0.886, blue: 0.886 },
              textFormat: { foregroundColor: { red: 0.725, green: 0.11, blue: 0.11 }, bold: true }
            }
          }
        },
        index: 2
      }
    }
  );
  const addCashflowHighlighting = (sheetId, colIndex, startRuleIdx) => {
    requests.push(
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: colIndex, endColumnIndex: colIndex + 1 }],
            booleanRule: {
              condition: { type: "NUMBER_GREATER", values: [{ userEnteredValue: "0" }] },
              format: {
                backgroundColor: { red: 0.902, green: 0.969, blue: 0.925 },
                textFormat: { foregroundColor: { red: 0.02, green: 0.478, blue: 0.239 }, bold: true }
              }
            }
          },
          index: startRuleIdx
        }
      },
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: colIndex, endColumnIndex: colIndex + 1 }],
            booleanRule: {
              condition: { type: "NUMBER_LESS", values: [{ userEnteredValue: "0" }] },
              format: {
                backgroundColor: { red: 0.988, green: 0.91, blue: 0.91 },
                textFormat: { foregroundColor: { red: 0.784, green: 0.118, blue: 0.169 }, bold: true }
              }
            }
          },
          index: startRuleIdx + 1
        }
      }
    );
  };
  addCashflowHighlighting(getSheetId("Finance_Daily"), 3, 0);
  addCashflowHighlighting(getSheetId("Finance_Weekly"), 5, 0);
  addCashflowHighlighting(getSheetId("Finance_Monthly"), 5, 0);
  const execSheetId = getSheetId("Executive_Dashboard");
  const finDashId = getSheetId("Finance_Dashboard");
  const prodDashId = getSheetId("Productivity_Dashboard");
  const finMonthlyId = getSheetId("Finance_Monthly");
  const focusDailyId = getSheetId("Focus_Daily");
  requests.push(
    {
      addChart: {
        chart: {
          spec: {
            title: "Monthly Inflows vs. Operating Expenses (\u20B9)",
            basicChart: {
              chartType: "COLUMN",
              legendPosition: "BOTTOM_LEGEND",
              headerCount: 1,
              axis: [
                { position: "BOTTOM_AXIS", title: "Month" },
                { position: "LEFT_AXIS", title: "INR (\u20B9)" }
              ],
              domains: [
                {
                  domain: {
                    sourceRange: {
                      sources: [
                        { sheetId: finMonthlyId, startRowIndex: 0, endRowIndex: 13, startColumnIndex: 0, endColumnIndex: 1 }
                      ]
                    }
                  }
                }
              ],
              series: [
                {
                  series: {
                    sourceRange: {
                      sources: [
                        { sheetId: finMonthlyId, startRowIndex: 0, endRowIndex: 13, startColumnIndex: 1, endColumnIndex: 2 }
                      ]
                    }
                  },
                  targetAxis: "LEFT_AXIS"
                },
                {
                  series: {
                    sourceRange: {
                      sources: [
                        { sheetId: finMonthlyId, startRowIndex: 0, endRowIndex: 13, startColumnIndex: 4, endColumnIndex: 5 }
                      ]
                    }
                  },
                  targetAxis: "LEFT_AXIS"
                }
              ]
            }
          },
          position: {
            overlayPosition: {
              anchorCell: { sheetId: execSheetId, rowIndex: 3, columnIndex: 7 },
              widthPixels: 520,
              heightPixels: 310
            }
          }
        }
      }
    },
    {
      addChart: {
        chart: {
          spec: {
            title: "Daily Deep Work Focus Trend (Hours)",
            basicChart: {
              chartType: "LINE",
              legendPosition: "BOTTOM_LEGEND",
              headerCount: 1,
              axis: [
                { position: "BOTTOM_AXIS", title: "Date" },
                { position: "LEFT_AXIS", title: "Hours" }
              ],
              domains: [
                {
                  domain: {
                    sourceRange: {
                      sources: [
                        { sheetId: focusDailyId, startRowIndex: 0, endRowIndex: 32, startColumnIndex: 0, endColumnIndex: 1 }
                      ]
                    }
                  }
                }
              ],
              series: [
                {
                  series: {
                    sourceRange: {
                      sources: [
                        { sheetId: focusDailyId, startRowIndex: 0, endRowIndex: 32, startColumnIndex: 3, endColumnIndex: 4 }
                      ]
                    }
                  },
                  targetAxis: "LEFT_AXIS"
                }
              ]
            }
          },
          position: {
            overlayPosition: {
              anchorCell: { sheetId: execSheetId, rowIndex: 19, columnIndex: 7 },
              widthPixels: 520,
              heightPixels: 290
            }
          }
        }
      }
    },
    {
      addChart: {
        chart: {
          spec: {
            title: "Fixed vs. Variable Outflow Mix (\u20B9)",
            pieChart: {
              legendPosition: "RIGHT_LEGEND",
              pieHole: 0.55,
              domain: {
                sourceRange: {
                  sources: [
                    { sheetId: execSheetId, startRowIndex: 21, endRowIndex: 23, startColumnIndex: 0, endColumnIndex: 1 }
                  ]
                }
              },
              series: {
                sourceRange: {
                  sources: [
                    { sheetId: execSheetId, startRowIndex: 21, endRowIndex: 23, startColumnIndex: 1, endColumnIndex: 2 }
                  ]
                }
              }
            }
          },
          position: {
            overlayPosition: {
              anchorCell: { sheetId: execSheetId, rowIndex: 3, columnIndex: 13 },
              widthPixels: 430,
              heightPixels: 310
            }
          }
        }
      }
    },
    {
      addChart: {
        chart: {
          spec: {
            title: "Net Monthly Savings & Treasury Accumulation (\u20B9)",
            basicChart: {
              chartType: "COLUMN",
              legendPosition: "NONE",
              headerCount: 1,
              axis: [
                { position: "BOTTOM_AXIS", title: "Month" },
                { position: "LEFT_AXIS", title: "Net Savings (\u20B9)" }
              ],
              domains: [
                {
                  domain: {
                    sourceRange: {
                      sources: [
                        { sheetId: finMonthlyId, startRowIndex: 0, endRowIndex: 13, startColumnIndex: 0, endColumnIndex: 1 }
                      ]
                    }
                  }
                }
              ],
              series: [
                {
                  series: {
                    sourceRange: {
                      sources: [
                        { sheetId: finMonthlyId, startRowIndex: 0, endRowIndex: 13, startColumnIndex: 5, endColumnIndex: 6 }
                      ]
                    }
                  },
                  targetAxis: "LEFT_AXIS"
                }
              ]
            }
          },
          position: {
            overlayPosition: {
              anchorCell: { sheetId: finDashId, rowIndex: 3, columnIndex: 7 },
              widthPixels: 520,
              heightPixels: 310
            }
          }
        }
      }
    },
    {
      addChart: {
        chart: {
          spec: {
            title: "Daily Completed Pomodoro Cycles",
            basicChart: {
              chartType: "COLUMN",
              legendPosition: "NONE",
              headerCount: 1,
              axis: [
                { position: "BOTTOM_AXIS", title: "Date" },
                { position: "LEFT_AXIS", title: "Completed Sessions" }
              ],
              domains: [
                {
                  domain: {
                    sourceRange: {
                      sources: [
                        { sheetId: focusDailyId, startRowIndex: 0, endRowIndex: 32, startColumnIndex: 0, endColumnIndex: 1 }
                      ]
                    }
                  }
                }
              ],
              series: [
                {
                  series: {
                    sourceRange: {
                      sources: [
                        { sheetId: focusDailyId, startRowIndex: 0, endRowIndex: 32, startColumnIndex: 4, endColumnIndex: 5 }
                      ]
                    }
                  },
                  targetAxis: "LEFT_AXIS"
                }
              ]
            }
          },
          position: {
            overlayPosition: {
              anchorCell: { sheetId: prodDashId, rowIndex: 3, columnIndex: 7 },
              widthPixels: 520,
              heightPixels: 310
            }
          }
        }
      }
    }
  );
  return requests;
}
function buildSyncResizeRequests() {
  return WORKSHEET_NAMES.map((name) => ({
    autoResizeDimensions: {
      dimensions: {
        sheetId: getSheetId(name),
        dimension: "COLUMNS",
        startIndex: 0,
        endIndex: WORKSHEET_HEADERS[name].length
      }
    }
  }));
}
function buildSyncValueUpdates(data) {
  const valueUpdates = [];
  const syncTimestamp = (/* @__PURE__ */ new Date()).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium"
  });
  const activeIncomes = data.incomes.filter((i) => !i.deletedAt);
  const activeExpenses = data.expenses.filter((e) => !e.deletedAt);
  const activeBills = data.bills.filter((b) => !b.deletedAt);
  const activeTasks = (data.tasks || []).filter((t) => !t.deletedAt);
  const activeEnvelopes = (data.envelopes || []).filter((env) => !env.deletedAt);
  const activeGoals = (data.savingsGoals || []).filter(
    (g) => !("deletedAt" in g && Boolean(g.deletedAt))
  );
  const billPaymentMethodMap = /* @__PURE__ */ new Map();
  for (const p of data.paymentHistory || []) {
    if (p.billId && p.paymentMethod && p.status !== "reversed") {
      billPaymentMethodMap.set(p.billId, p.paymentMethod);
    }
  }
  for (const exp of activeExpenses) {
    if (exp.billId && exp.paymentMethod && !billPaymentMethodMap.has(exp.billId)) {
      billPaymentMethodMap.set(exp.billId, exp.paymentMethod);
    }
  }
  const execRows = [
    [
      "FOCUSFLOW & FINANCE \u2014 EXECUTIVE INTELLIGENCE DASHBOARD",
      "Workbook Status:",
      "ACTIVE & SYNCHRONIZED",
      "Last Refreshed:",
      syncTimestamp,
      "Base Currency: INR (\u20B9)"
    ],
    [
      "Unified executive intelligence across productivity velocity and financial treasury reserves.",
      "",
      "",
      "",
      "",
      ""
    ],
    WORKSHEET_HEADERS.Executive_Dashboard,
    ["Productivity", "Today's Deep Work Focus", '=IFERROR(VLOOKUP(TODAY(), Focus_Daily!A:C, 3, FALSE), 0) & " min"', ">= 120 min", "Daily", "Today logged focus duration"],
    ["Productivity", "Weekly Focus Volume", '=Focus_Weekly!B2 & " hrs"', ">= 15 hrs", "Weekly", "Rolling 7-day deep work hours"],
    ["Productivity", "Monthly Focus Volume", '=Focus_Monthly!B2 & " hrs"', ">= 60 hrs", "Monthly", "Total month deep focus volume"],
    ["Productivity", "Completed Focus Cycles", '=COUNTIF(Focus_Sessions!F:F, "YES")', "All-Time", "Cumulative", "Verified completed Pomodoro sessions"],
    ["Productivity", "Average Session Duration", '=IFERROR(ROUND(AVERAGE(Focus_Sessions!D:D), 1), 0) & " min"', "25-50 min", "Per Session", "Average continuous focus span"],
    ["Productivity", "Current Productivity Streak", '=Focus_Monthly!D2 & " days"', "Continuous", "Daily", "Consecutive days with focus sessions"],
    ["Productivity", "Task Completion Velocity", "=Task_Analytics!B5", ">= 75.0%", "Cumulative", "Completed vs total registered tasks"],
    ["Finance", "Total Cumulative Inflow", "=SUM(Income!E2:E)", "Gross Earnings", "All-Time", "Verified revenue and income receipts"],
    ["Finance", "Total Operating Outflows", "=SUM(Variable_Expenses!E2:E) + SUM(Fixed_Expenses!D2:D)", "Total Spend", "All-Time", "Variable spend plus fixed commitments"],
    ["Finance", "Net Treasury Balance", "=C11-C12", "Positive Cash", "Current", "Liquid reserves net position after outflows"],
    ["Finance", "Monthly Fixed Commitments", "=SUM(Fixed_Expenses!D2:D)", "Contractual", "Monthly", "Rent, utilities, subscriptions & insurance"],
    ["Finance", "Variable Spending Volume", "=SUM(Variable_Expenses!E2:E)", "Discretionary", "Current", "Groceries, transit, dining & shopping"],
    ["Finance", "Settled Bill Disbursements", '=SUMIF(Bills_Payments!F:F, "PAID", Bills_Payments!E:E)', "Disbursed", "Monthly", "Settled commitments with payment proof"],
    ["Finance", "Pending Scheduled Bills", '=SUMIF(Bills_Payments!F:F, "UNPAID", Bills_Payments!E:E)', "Upcoming", "Monthly", "Scheduled bills awaiting due date settlement"],
    ["Finance", "Overdue Debt Warning", '=SUMIF(Bills_Payments!F:F, "OVERDUE", Bills_Payments!E:E)', "\u20B90.00 (Zero)", "Immediate", "Unsettled bills past due date"],
    ["Finance", "Monthly Savings Rate", "=IF(C11>0, (C11-C12)/C11, 0)", ">= 20.0%", "Monthly", "Net savings as percentage of gross income"],
    ["Finance", "Envelope Budget Utilization", "=IF(SUM(Budgets!C2:C)>0, SUM(Budgets!D2:D)/SUM(Budgets!C2:C), 0)", "<= 100.0%", "Monthly", "Overall envelope budget absorption"],
    ["", "", "", "", "", ""],
    ["Fixed Commitments", "=SUM(Fixed_Expenses!D2:D)", "", "", "", ""],
    ["Variable Outflows", "=SUM(Variable_Expenses!E2:E)", "", "", "", ""]
  ];
  valueUpdates.push({
    range: "Executive_Dashboard!A1:F23",
    values: execRows
  });
  const finDashRows = [
    [
      "FINANCE EXECUTIVE DASHBOARD \u2014 CASHFLOW & TREASURY INTELLIGENCE",
      "Status:",
      "ACTIVE",
      "Currency:",
      "INR (\u20B9)",
      syncTimestamp
    ],
    [
      "Comprehensive financial analytics, expense classification, bill settlement and budget health.",
      "",
      "",
      "",
      "",
      ""
    ],
    WORKSHEET_HEADERS.Finance_Dashboard,
    ["Gross Monthly Inflow", "=Finance_Monthly!B2", "Target Inflow", "HEALTHY", "Monthly", "Current month recognized income"],
    ["Fixed Monthly Outflow", "=Finance_Monthly!C2", "Contractual Cap", "COMMITTED", "Monthly", "Rent, utilities, SaaS & insurance"],
    ["Variable Monthly Outflow", "=Finance_Monthly!D2", "Budget Cap", "ON_TRACK", "Monthly", "Day-to-day operational spend"],
    ["Total Monthly Disbursements", "=Finance_Monthly!E2", "Outflow Ceiling", "TRACKED", "Monthly", "Combined monthly outflow"],
    ["Net Monthly Treasury Accumulation", "=Finance_Monthly!F2", "Positive Cash", "SAVINGS", "Monthly", "Net cash surplus retained"],
    ["Net Savings Rate", "=Finance_Monthly!G2", ">= 20.0%", "BENCHMARK", "Monthly", "Savings percentage of gross inflow"],
    ["Total Settled Bills", '=SUMIF(Bills_Payments!F:F, "PAID", Bills_Payments!E:E)', "Disbursed", "PAID", "Monthly", "Settled bills in current schedule"],
    ["Pending Scheduled Bills", '=SUMIF(Bills_Payments!F:F, "UNPAID", Bills_Payments!E:E)', "Due Soon", "PENDING", "Monthly", "Upcoming bills within grace period"],
    ["Overdue Payment Alert", '=SUMIF(Bills_Payments!F:F, "OVERDUE", Bills_Payments!E:E)', "\u20B90.00", "CRITICAL", "Urgent", "Overdue obligations requiring payment"],
    ["Total Allocated Budget Envelopes", "=SUM(Budgets!C2:C)", "Envelope Ceiling", "PLANNED", "Monthly", "Sum of all category budget allocations"],
    ["Total Envelope Spend Recorded", "=SUM(Budgets!D2:D)", "<= Allocated", "SPENT", "Monthly", "Total spend categorized under envelopes"],
    ["Remaining Budget Surplus", "=SUM(Budgets!E2:E)", "Positive Balance", "AVAILABLE", "Monthly", "Remaining available envelope balance"]
  ];
  valueUpdates.push({
    range: "Finance_Dashboard!A1:F15",
    values: finDashRows
  });
  const prodDashRows = [
    [
      "PRODUCTIVITY EXECUTIVE DASHBOARD \u2014 DEEP WORK & TASK VELOCITY",
      "Status:",
      "ACTIVE",
      "Interval:",
      "25m Pomodoro",
      syncTimestamp
    ],
    [
      "Granular performance tracking, Pomodoro stamina, task completion velocity and daily streak logs.",
      "",
      "",
      "",
      "",
      ""
    ],
    WORKSHEET_HEADERS.Productivity_Dashboard,
    ["Total Focus Hours Logged", "=SUM(Focus_Daily!D2:D)", ">= 100 hrs", "ON_TRACK", "All-Time", "Total verified deep work hours"],
    ["Total Completed Pomodoro Cycles", "=SUM(Focus_Daily!E2:E)", "Target: 250+", "RECORDED", "All-Time", "Completed full focus sessions"],
    ["Current Active Focus Streak", '=Focus_Monthly!D2 & " days"', "Target: 30 days", "ACTIVE", "Daily", "Unbroken daily focus habit streak"],
    ["Total Registered Tasks Inventory", "=COUNTA(Tasks!A2:A)", "Active Backlog", "MANAGEABLE", "Current", "Total tasks in project pipeline"],
    ["Finished & Verified Tasks", '=COUNTIF(Tasks!D2:D, "completed")', "Max throughput", "COMPLETED", "Current", "Successfully delivered tasks"],
    ["Tasks Currently In Progress", '=COUNTIF(Tasks!D2:D, "in_progress")', "<= 3 concurrent", "WIP_LIMIT", "Current", "Active focus tasks without switching"],
    ["Backlog Pending Tasks", '=COUNTIF(Tasks!D2:D, "todo")', "Prioritized queue", "QUEUED", "Current", "Awaiting execution"],
    ["High-Priority Critical Tasks", '=COUNTIF(Tasks!C2:C, "high")', "Minimize bottlenecks", "HIGH_PRIORITY", "Current", "Urgent tasks requiring prompt delivery"],
    ["Estimated Total Pomodoros", "=SUM(Tasks!E2:E)", "Resource plan", "PLANNED", "All-Time", "Estimated workload demand"],
    ["Completed Pomodoro Cycles", "=SUM(Tasks!F2:F)", "Actual effort", "DELIVERED", "All-Time", "Actual Pomodoros logged to tasks"]
  ];
  valueUpdates.push({
    range: "Productivity_Dashboard!A1:F13",
    values: prodDashRows
  });
  const sessionRows = data.sessions.map((s) => [
    s.id,
    s.startedAt.split("T")[0],
    s.mode.toUpperCase(),
    s.durationMinutes,
    s.taskTitle || "Independent Deep Work Focus",
    s.completed ? "YES" : "NO",
    s.startedAt,
    s.endedAt || ""
  ]);
  valueUpdates.push({
    range: `Focus_Sessions!A2:H${Math.max(2, sessionRows.length + 1)}`,
    values: sessionRows.length > 0 ? sessionRows : [["", "", "", "", "", "", "", ""]]
  });
  const dailyRows = (data.focusStats?.last7Days || []).map((d) => [
    d.date,
    d.dayName,
    d.minutes,
    parseFloat((d.minutes / 60).toFixed(2)),
    d.sessionsCount
  ]);
  valueUpdates.push({
    range: `Focus_Daily!A2:E${Math.max(2, dailyRows.length + 1)}`,
    values: dailyRows.length > 0 ? dailyRows : [["", "", 0, 0, 0]]
  });
  const weeklyRows = [
    [
      "Current Week Active",
      parseFloat(((data.focusStats?.weeklyMinutes ?? data.focusStats?.totalMinutes ?? 0) / 60).toFixed(1)),
      data.focusStats?.last7Days?.length ? Math.round((data.focusStats.weeklyMinutes ?? data.focusStats.totalMinutes ?? 0) / 7) : 0,
      data.focusStats?.totalCompletedSessions || 0
    ]
  ];
  valueUpdates.push({
    range: "Focus_Weekly!A2:D2",
    values: weeklyRows
  });
  const bestStreak = computeBestStreakFromSessions(data.sessions);
  const monthlyFocusRows = [
    [
      (/* @__PURE__ */ new Date()).toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      parseFloat(((data.focusStats?.monthMinutes || 0) / 60).toFixed(1)),
      data.focusStats?.monthSessionsCount || 0,
      bestStreak
    ]
  ];
  valueUpdates.push({
    range: "Focus_Monthly!A2:D2",
    values: monthlyFocusRows
  });
  const taskRows = activeTasks.map((t) => [
    t.id,
    t.title,
    t.priority,
    t.status,
    t.estimatedPomodoros,
    t.completedPomodoros,
    t.dueDate || "",
    t.category || "General",
    t.recurrence || "none",
    t.createdAt
  ]);
  valueUpdates.push({
    range: `Tasks!A2:J${Math.max(2, taskRows.length + 1)}`,
    values: taskRows.length > 0 ? taskRows : [["", "", "", "", "", "", "", "", "", ""]]
  });
  const taskAnalyticsRows = [
    ["Total Registered Tasks", "=COUNTA(Tasks!A2:A)", "Backlog standard", "NORMAL", "Total tasks in project pipeline"],
    ["Completed & Verified Tasks", '=COUNTIF(Tasks!D2:D, "completed")', "High throughput", "ON_TRACK", "Delivered tasks"],
    ["Active In-Progress Tasks", '=COUNTIF(Tasks!D2:D, "in_progress")', "<= 3 concurrent", "WIP_LIMIT", "Active focus tasks"],
    ["Pending Backlog Tasks", '=COUNTIF(Tasks!D2:D, "todo")', "Prioritized queue", "QUEUED", "Upcoming tasks"],
    ["Overall Completion Ratio", "=IF(B1>0, B2/B1, 0)", ">= 75.0%", "BENCHMARK", "Percentage of completed backlog"],
    ["High Priority Tasks Total", '=COUNTIF(Tasks!C2:C, "high")', "Minimize count", "ALERT", "Critical requirements"],
    ["High Priority Completed", '=COUNTIFS(Tasks!C2:C, "high", Tasks!D2:D, "completed")', "100% target", "DELIVERED", "Resolved critical tasks"],
    ["High Priority Pending", '=COUNTIFS(Tasks!C2:C, "high", Tasks!D2:D, "<>completed")', "0 target", "ATTENTION", "Urgent unfinished tasks"],
    ["Total Estimated Pomodoros", "=SUM(Tasks!E2:E)", "Planned effort", "ESTIMATED", "Total workload estimate"],
    ["Total Delivered Pomodoros", "=SUM(Tasks!F2:F)", "Actual effort", "DELIVERED", "Actual effort executed"]
  ];
  valueUpdates.push({
    range: "Task_Analytics!A2:E11",
    values: taskAnalyticsRows
  });
  const goalRows = [
    ["Daily Deep Work Hours", "120 min", '=IFERROR(VLOOKUP(TODAY(), Focus_Daily!A:C, 3, FALSE), 0) & " min"', "=IF(120>0, IFERROR(VLOOKUP(TODAY(), Focus_Daily!A:C, 3, FALSE), 0)/120, 0)", "Daily", "Goal: 2 hours deep focus"],
    ["Weekly Deep Work Volume", "15.0 hrs", '=Focus_Weekly!B2 & " hrs"', "=IF(15>0, Focus_Weekly!B2/15, 0)", "Weekly", "Goal: 15 productive focus hours"],
    ["Daily Completed Pomodoros", "4 sessions", "=IFERROR(VLOOKUP(TODAY(), Focus_Daily!A:E, 5, FALSE), 0)", "=IF(4>0, IFERROR(VLOOKUP(TODAY(), Focus_Daily!A:E, 5, FALSE), 0)/4, 0)", "Daily", "Goal: 4 completed sessions"],
    ["Task Delivery Velocity", "5 tasks", '=COUNTIF(Tasks!D2:D, "completed")', '=IF(5>0, COUNTIF(Tasks!D2:D, "completed")/5, 0)', "Weekly", "Goal: 5 completed tasks per sprint"]
  ];
  valueUpdates.push({
    range: "Productivity_Goals!A2:F5",
    values: goalRows
  });
  const incomeRows = activeIncomes.map((inc) => [
    inc.id,
    inc.date,
    inc.source,
    inc.category,
    inc.amountPaise / 100,
    inc.notes || ""
  ]);
  valueUpdates.push({
    range: `Income!A2:F${Math.max(2, incomeRows.length + 1)}`,
    values: incomeRows.length > 0 ? incomeRows : [["", "", "", "", "", ""]]
  });
  const fixedRows = data.recurring.map((rec) => [
    rec.id,
    rec.name,
    rec.categoryName || "Fixed Commitment",
    rec.amountPaise / 100,
    rec.recurrence.toUpperCase(),
    rec.dueDay,
    rec.isActive ? "ACTIVE" : "INACTIVE",
    rec.notes || ""
  ]);
  valueUpdates.push({
    range: `Fixed_Expenses!A2:H${Math.max(2, fixedRows.length + 1)}`,
    values: fixedRows.length > 0 ? fixedRows : [["", "", "", "", "", "", "", ""]]
  });
  const varExpenses = activeExpenses.filter((e) => e.type === "variable");
  const varRows = varExpenses.map((exp) => [
    exp.id,
    exp.date,
    exp.description,
    exp.categoryName || "General",
    exp.amountPaise / 100,
    formatPaymentMethodLabel(exp.paymentMethod, true),
    exp.notes || ""
  ]);
  valueUpdates.push({
    range: `Variable_Expenses!A2:G${Math.max(2, varRows.length + 1)}`,
    values: varRows.length > 0 ? varRows : [["", "", "", "", "", "", ""]]
  });
  const billRows = activeBills.map((b) => {
    const resolvedMethod = billPaymentMethodMap.get(b.id);
    return [
      b.id,
      b.dueDate,
      b.name,
      b.categoryName || "General Bill",
      b.amountPaise / 100,
      b.status,
      b.paymentDate || "",
      formatPaymentMethodLabel(resolvedMethod, b.status === "PAID"),
      b.notes || ""
    ];
  });
  valueUpdates.push({
    range: `Bills_Payments!A2:I${Math.max(2, billRows.length + 1)}`,
    values: billRows.length > 0 ? billRows : [["", "", "", "", "", "", "", "", ""]]
  });
  const budgetRows = activeEnvelopes.map((env) => {
    const allocated = env.allocatedPaise / 100;
    const spent = (env.spentPaise || 0) / 100;
    const remaining = allocated - spent;
    const ratio = allocated > 0 ? parseFloat((spent / allocated).toFixed(4)) : 0;
    const health = spent > allocated ? "OVERSPENT" : spent >= allocated * 0.85 ? "WARNING" : "ON_TRACK";
    return [env.id, env.name, allocated, spent, remaining, ratio, health];
  });
  valueUpdates.push({
    range: `Budgets!A2:G${Math.max(2, budgetRows.length + 1)}`,
    values: budgetRows.length > 0 ? budgetRows : [["", "", 0, 0, 0, 0, "ON_TRACK"]]
  });
  const goalRowsFinance = activeGoals.map((g) => {
    const target = g.targetPaise / 100;
    const current = g.savedPaise / 100;
    const remaining = Math.max(0, target - current);
    const progress = target > 0 ? parseFloat((current / target).toFixed(4)) : 0;
    const status = current >= target ? "ACHIEVED" : "IN_PROGRESS";
    return [g.id, g.title, target, current, remaining, g.targetDate || "", progress, status];
  });
  valueUpdates.push({
    range: `Savings_Goals!A2:H${Math.max(2, goalRowsFinance.length + 1)}`,
    values: goalRowsFinance.length > 0 ? goalRowsFinance : [["", "", 0, 0, 0, "", 0, "IN_PROGRESS"]]
  });
  const todayStr = getTodayDateString();
  const todayIncome = activeIncomes.filter((i) => i.date === todayStr).reduce((sum, i) => sum + i.amountPaise, 0) / 100;
  const todayExpense = activeExpenses.filter((e) => e.date === todayStr).reduce((sum, e) => sum + e.amountPaise, 0) / 100;
  valueUpdates.push({
    range: "Finance_Daily!A2:D2",
    values: [[todayStr, todayIncome, todayExpense, todayIncome - todayExpense]]
  });
  const totalWeeklyIncome = (data.financeSummary?.totalIncomePaise || 0) / 100;
  const totalWeeklyFixed = (data.financeSummary?.fixedExpensesPaise || 0) / 100;
  const totalWeeklyVar = (data.financeSummary?.variableExpensesPaise || 0) / 100;
  const totalWeeklyExp = (data.financeSummary?.totalExpensePaise || 0) / 100;
  valueUpdates.push({
    range: "Finance_Weekly!A2:F2",
    values: [
      [
        "Current Active Period",
        totalWeeklyIncome,
        totalWeeklyFixed,
        totalWeeklyVar,
        totalWeeklyExp,
        totalWeeklyIncome - totalWeeklyExp
      ]
    ]
  });
  const monthlyIncome = (data.financeSummary?.totalIncomePaise || 0) / 100;
  const monthlyFixed = (data.financeSummary?.fixedExpensesPaise || 0) / 100;
  const monthlyVar = (data.financeSummary?.variableExpensesPaise || 0) / 100;
  const monthlyTotalExp = (data.financeSummary?.totalExpensePaise || 0) / 100;
  const savings = monthlyIncome - monthlyTotalExp;
  const savingsRatio = monthlyIncome > 0 ? parseFloat((savings / monthlyIncome).toFixed(4)) : 0;
  const trend = data.financeSummary?.monthlyTrend || [];
  const monthlyRows = trend.length > 0 ? trend.map((pt, idx) => {
    const isLatest = idx === trend.length - 1;
    const inc = isLatest ? monthlyIncome : pt.incomePaise / 100;
    const exp = isLatest ? monthlyTotalExp : pt.expensePaise / 100;
    const net = inc - exp;
    const ratio = inc > 0 ? parseFloat((net / inc).toFixed(4)) : 0;
    return [
      pt.month,
      inc,
      isLatest ? monthlyFixed : 0,
      isLatest ? monthlyVar : exp,
      exp,
      net,
      ratio
    ];
  }) : [
    [
      (/* @__PURE__ */ new Date()).toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      monthlyIncome,
      monthlyFixed,
      monthlyVar,
      monthlyTotalExp,
      savings,
      savingsRatio
    ]
  ];
  valueUpdates.push({
    range: `Finance_Monthly!A2:G${Math.max(2, monthlyRows.length + 1)}`,
    values: monthlyRows
  });
  const syncControlRows = [
    ["Primary Database Store", "Cloud Firestore", "Single Source of Truth", "Isolated tenant subcollection tree"],
    ["Secondary Analytical Ledger", "Google Sheets API v4", "Executive Reporting", "23 styled worksheets with dynamic formulas"],
    ["Synchronization Protocol", "Durable Server Queue", "ACTIVE & SYNCHRONIZED", "Exponential backoff & retry mechanism"],
    ["Last Verified Synchronization", syncTimestamp, "Status: SUCCESS", "Synchronized via values:batchUpdate without reformatting"],
    ["Total Registered Tasks Count", activeTasks.length, "Records Verified", "Tasks collection in Firestore"],
    ["Total Verified Incomes Count", activeIncomes.length, "Records Verified", "Income subcollection in Firestore"],
    ["Total Verified Expenses Count", activeExpenses.length, "Records Verified", "Expenses subcollection in Firestore"],
    ["Total Verified Bills Count", activeBills.length, "Records Verified", "Bills subcollection in Firestore"],
    ["Total Focus Sessions Count", data.sessions.length, "Records Verified", "Focus sessions subcollection in Firestore"],
    ["Data Format Preservation", "ACTIVE", "Decoupled Value Updates", "Formatting, formulas & charts remain completely intact"]
  ];
  valueUpdates.push({
    range: "Sync_Control!A2:D11",
    values: syncControlRows
  });
  const queueErrors = (data.syncQueue || []).filter((op) => op.status === "failed" || op.attempts > 0);
  const errorRows = queueErrors.length > 0 ? queueErrors.map((op) => [
    op.id,
    op.lastAttemptAt || op.createdAt,
    op.action.toUpperCase(),
    op.entityType,
    op.sheetName,
    op.attempts,
    op.errorMessage || "Unknown synchronization error",
    op.status.toUpperCase()
  ]) : [
    [
      "LOG_INIT",
      syncTimestamp,
      "HEALTH_CHECK",
      "SYSTEM",
      "WORKBOOK_INIT",
      0,
      "All synchronization pipelines healthy; zero transmission failures recorded.",
      "RESOLVED"
    ]
  ];
  valueUpdates.push({
    range: `Sync_Error_Log!A2:H${Math.max(2, errorRows.length + 1)}`,
    values: errorRows
  });
  const dictionaryRows = [
    ["Executive_Dashboard", "All Cells", "Formula / Card", "Formatted Text & Tiles", "None", "Aggregates from raw sheets without destroying formats"],
    ["Finance_Dashboard", "All Cells", "Formula / Card", "INR Currency (\u20B9)", "None", "Cashflow and treasury health summary"],
    ["Productivity_Dashboard", "All Cells", "Formula / Card", "Hours & Integers", "None", "Deep work velocity and task completion metrics"],
    ["Focus_Sessions", "Duration (Min)", "Integer", "#,##0", ">= 1", "Focus session duration in minutes"],
    ["Tasks", "Priority", "Enum String", "Dropdown Text", "high, medium, low", "Task importance level"],
    ["Tasks", "Status", "Enum String", "Dropdown Text", "todo, in_progress, completed", "Execution state of task"],
    ["Income", "Amount (\u20B9)", "Decimal", '"\u20B9"#,##0.00', "> 0", "Monetary earnings received"],
    ["Fixed_Expenses", "Monthly Outflow (\u20B9)", "Decimal", '"\u20B9"#,##0.00', "> 0", "Recurring fixed financial commitment"],
    ["Variable_Expenses", "Amount (\u20B9)", "Decimal", '"\u20B9"#,##0.00', "> 0", "Day-to-day transaction amount"],
    ["Bills_Payments", "Payment Status", "Enum String", "Dropdown Text", "PAID, UNPAID, OVERDUE", "Bill fulfillment state"],
    ["Budgets", "Allocated Amount (\u20B9)", "Decimal", '"\u20B9"#,##0.00', ">= 0", "Monthly envelope budget limit"],
    ["Budgets", "Utilization (%)", "Percentage", "0.0%", ">= 0%", "Spent Amount / Allocated Amount"],
    ["Savings_Goals", "Progress (%)", "Percentage", "0.0%", "0.0% - 100.0%", "Current Saved / Target Amount"],
    ["Finance_Monthly", "Savings Rate (%)", "Percentage", "0.0%", "Any Ratio", "(Total Income - Total Expenses) / Total Income"]
  ];
  valueUpdates.push({
    range: "Data_Dictionary!A2:F15",
    values: dictionaryRows
  });
  const settingsRows = [
    ["Base Reporting Currency", data.userSettings?.currency || "INR", "INR", "Base currency symbol and Indian numbering formatting"],
    ["Primary System Timezone", data.userSettings?.timezone || "Asia/Kolkata", "Asia/Kolkata", "Timezone for date boundaries and streak tracking"],
    ["Number Format Pattern", 'Indian Rupee ("\u20B9"#,##0.00)', '"\u20B9"#,##0.00', "Standard currency display format"],
    ["Date Representation", "ISO 8601 (YYYY-MM-DD)", "YYYY-MM-DD", "Consistent cross-platform date standard"],
    ["Week Start Day", "Monday", "Monday", "Starting day for weekly productivity and cashflow rollups"],
    ["Pomodoro Work Interval", `${data.userSettings?.pomodoroWorkDuration || 25} minutes`, "25 minutes", "Standard focus work duration"],
    ["Short Break Duration", `${data.userSettings?.shortBreakDuration || 5} minutes`, "5 minutes", "Rest duration after single focus session"],
    ["Long Break Duration", `${data.userSettings?.longBreakDuration || 15} minutes`, "15 minutes", "Rest duration after 4 completed Pomodoros"]
  ];
  valueUpdates.push({
    range: "Settings!A2:D9",
    values: settingsRows
  });
  return valueUpdates;
}

// server/sheetsWorker.ts
var SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
function isValidSpreadsheetId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{10,128}$/.test(id.trim());
}
async function readErrorText(res) {
  try {
    const text = await res.text();
    if (!text) return `HTTP ${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error?.message) {
        const reason = parsed.error.errors?.[0]?.reason || parsed.error.status;
        const msg = parsed.error.message;
        return reason ? `${msg} (status: ${res.status}, reason: ${reason})` : `${msg} (status: ${res.status})`;
      }
    } catch {
    }
    return text.slice(0, 400);
  } catch {
    return `HTTP ${res.status} ${res.statusText}`;
  }
}
function computeBackoffDelayMs(attempts, jitterRatio = Math.random()) {
  const safeAttempts = Math.max(1, attempts);
  const baseMs = Math.min(3e5, 2e3 * Math.pow(2, safeAttempts));
  const clampedJitter = Math.max(0, Math.min(1, jitterRatio));
  const jitterMs = Math.round(baseMs * 0.25 * clampedJitter);
  return Math.min(3e5, baseMs + jitterMs);
}
async function verifySpreadsheet(spreadsheetId, accessToken, fetchImpl = fetch) {
  if (!isValidSpreadsheetId(spreadsheetId)) {
    throw new Error("Invalid Google Spreadsheet ID format.");
  }
  if (!accessToken || !accessToken.trim()) {
    throw new Error("Google Sheets authorization token is required.");
  }
  const fields = encodeURIComponent(
    "spreadsheetId,properties.title,sheets(properties(sheetId,title,gridProperties))"
  );
  const res = await fetchImpl(`${SHEETS_API_BASE}/${spreadsheetId}?fields=${fields}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!res.ok) {
    const errMsg = await readErrorText(res);
    throw new Error(`Unable to verify target spreadsheet (${res.status}): ${errMsg}`);
  }
  const data = await res.json();
  if (!data?.spreadsheetId || !Array.isArray(data.sheets)) {
    throw new Error("Target spreadsheet metadata response was incomplete.");
  }
  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || "FocusFlow & Finance Ledger",
    sheets: data.sheets
  };
}
async function applyWorkbookFormatting(spreadsheetId, accessToken, options = {}, fetchImpl = fetch) {
  const { includeHeaders = false, includeAutoResize = true, verifyFirst = true } = options;
  if (verifyFirst) {
    await verifySpreadsheet(spreadsheetId, accessToken, fetchImpl);
  }
  if (includeHeaders) {
    const valuesRes = await fetchImpl(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: buildInitialHeaderValueUpdates()
      })
    });
    if (!valuesRes.ok) {
      const errMsg = await readErrorText(valuesRes);
      throw new Error(`Failed to initialize sheet headers: ${errMsg}`);
    }
  }
  const requests = [
    ...buildCreateStylingRequests(),
    ...includeAutoResize ? buildSyncResizeRequests() : []
  ];
  const styleRes = await fetchImpl(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ requests })
  });
  if (!styleRes.ok) {
    const errMsg = await readErrorText(styleRes);
    throw new Error(`Failed to apply workbook formatting: ${errMsg}`);
  }
}
async function createMasterWorkbook(accessToken, fetchImpl = fetch) {
  if (!accessToken || !accessToken.trim()) {
    throw new Error("Google authorization token is required to create a workbook.");
  }
  const sheetObjects = WORKSHEET_NAMES.map((name) => {
    const isDashboard = isDashboardWorksheet(name);
    return {
      properties: {
        sheetId: getSheetId(name),
        title: name,
        gridProperties: {
          rowCount: isDashboard ? 100 : 500,
          columnCount: isDashboard ? 26 : 18,
          frozenRowCount: isDashboard ? 2 : 1
        }
      }
    };
  });
  const createPayload = {
    properties: {
      title: "FocusFlow & Finance \u2014 Master Management Ledger",
      locale: "en_IN",
      autoRecalc: "ON_CHANGE"
    },
    sheets: sheetObjects
  };
  const res = await fetchImpl(SHEETS_API_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(createPayload)
  });
  if (!res.ok) {
    const errMsg = await readErrorText(res);
    throw new Error(`Failed to create master workbook in Google Sheets: ${errMsg}`);
  }
  const spreadsheet = await res.json();
  if (!spreadsheet?.spreadsheetId) {
    throw new Error("Google Sheets returned no spreadsheetId on workbook creation.");
  }
  await applyWorkbookFormatting(
    spreadsheet.spreadsheetId,
    accessToken,
    { includeHeaders: true, includeAutoResize: true, verifyFirst: false },
    fetchImpl
  );
  return { spreadsheetId: spreadsheet.spreadsheetId };
}
async function syncAllData(spreadsheetId, accessToken, data, options = {}, fetchImpl = fetch) {
  let verifiedTitle;
  if (options.verifyFirst !== false) {
    const meta = await verifySpreadsheet(spreadsheetId, accessToken, fetchImpl);
    verifiedTitle = meta.title;
  }
  const valueUpdates = buildSyncValueUpdates(data);
  const res = await fetchImpl(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: valueUpdates
    })
  });
  if (!res.ok) {
    const errMsg = await readErrorText(res);
    throw new Error(`Google Sheets value synchronization failed: ${errMsg}`);
  }
  return {
    updatedRangesCount: valueUpdates.length,
    verifiedTitle
  };
}
async function historicalResync(spreadsheetId, accessToken, data, confirmed, fetchImpl = fetch) {
  if (confirmed !== true) {
    throw new Error("Historical resync requires explicit user confirmation.");
  }
  const meta = await verifySpreadsheet(spreadsheetId, accessToken, fetchImpl);
  const clearRanges = buildDynamicClearRanges(meta.sheets);
  if (clearRanges.length > 0) {
    const clearRes = await fetchImpl(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchClear`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ranges: clearRanges })
    });
    if (!clearRes.ok) {
      const errMsg = await readErrorText(clearRes);
      throw new Error(`Historical resync aborted because clearing existing ranges failed: ${errMsg}`);
    }
  }
  const syncResult = await syncAllData(
    spreadsheetId,
    accessToken,
    data,
    { verifyFirst: false },
    fetchImpl
  );
  return {
    clearedRangesCount: clearRanges.length,
    updatedRangesCount: syncResult.updatedRangesCount
  };
}
function escapeSheetTitleForA1(title) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(title)) {
    return `'${title.replace(/'/g, "''")}'`;
  }
  return title;
}
async function fetchExistingRecordLocations(spreadsheetId, sheetNames, accessToken, fetchImpl) {
  const locMap = /* @__PURE__ */ new Map();
  if (sheetNames.length === 0) return locMap;
  const rangesQuery = sheetNames.map((s) => `ranges=${encodeURIComponent(`${escapeSheetTitleForA1(s)}!A2:A`)}`).join("&");
  const res = await fetchImpl(
    `${SHEETS_API_BASE}/${spreadsheetId}/values:batchGet?${rangesQuery}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
  if (!res.ok) {
    return locMap;
  }
  const body = await res.json();
  const valueRanges = Array.isArray(body?.valueRanges) ? body.valueRanges : [];
  for (let i = 0; i < sheetNames.length; i++) {
    const sheet = sheetNames[i];
    const vr = valueRanges[i];
    const idToRow = /* @__PURE__ */ new Map();
    let maxRow = 1;
    if (Array.isArray(vr?.values)) {
      for (let r = 0; r < vr.values.length; r++) {
        const rowNum = r + 2;
        maxRow = Math.max(maxRow, rowNum);
        const row = vr.values[r];
        if (Array.isArray(row) && row[0] !== void 0 && row[0] !== null) {
          const val = String(row[0]).trim();
          if (val) {
            idToRow.set(val, rowNum);
          }
        }
      }
    }
    locMap.set(sheet, { idToRow, maxRow });
  }
  return locMap;
}
function extractRecordIdFromOp(op) {
  if (Array.isArray(op.payload) && op.payload.length > 0) {
    const first = op.payload[0];
    if (first !== void 0 && first !== null) {
      return String(first).trim();
    }
  }
  if (typeof op.payload === "string") {
    return op.payload.trim();
  }
  if (op.payload && typeof op.payload === "object" && "id" in op.payload) {
    const idVal = op.payload.id;
    if (idVal !== void 0 && idVal !== null) {
      return String(idVal).trim();
    }
  }
  if (op.dedupeKey) {
    const parts = op.dedupeKey.split("_");
    if (parts.length >= 3) {
      return parts[parts.length - 1].trim();
    }
  }
  return "";
}
async function flushQueueOperations(spreadsheetId, accessToken, ops, fetchImpl = fetch, nowMs = Date.now()) {
  if (!ops || ops.length === 0) {
    return { processed: 0, skippedDuplicates: 0, failed: 0, results: [] };
  }
  const eligibleOps = ops.filter((op) => {
    if (op.status === "completed") return false;
    if (op.status === "failed" && (op.attempts || 0) >= 5) return false;
    if (op.nextRetryAt && op.nextRetryAt > nowMs) return false;
    return true;
  });
  if (eligibleOps.length === 0) {
    return { processed: 0, skippedDuplicates: 0, failed: 0, results: [] };
  }
  try {
    await verifySpreadsheet(spreadsheetId, accessToken, fetchImpl);
  } catch (verifyErr) {
    const errorMsg = verifyErr instanceof Error ? verifyErr.message : "Spreadsheet verification failed";
    const isAuthOrPermissionOrFormat = /\b401\b|\b403\b|PERMISSION_DENIED|The caller does not have permission|invalid authentication credentials|Invalid Google Spreadsheet ID/i.test(
      errorMsg
    );
    if (isAuthOrPermissionOrFormat) {
      throw verifyErr;
    }
    return {
      processed: 0,
      skippedDuplicates: 0,
      failed: eligibleOps.length,
      results: eligibleOps.map((op) => {
        const nextAttempts = (op.attempts || 0) + 1;
        const isTerminal = nextAttempts >= 5;
        const backoffMs = computeBackoffDelayMs(nextAttempts);
        return {
          id: op.id,
          status: isTerminal ? "failed" : "pending",
          attempts: nextAttempts,
          nextRetryAt: isTerminal ? null : nowMs + backoffMs,
          errorMessage: errorMsg
        };
      })
    };
  }
  const targetSheets = Array.from(
    new Set(eligibleOps.map((o) => o.sheetName).filter(Boolean))
  );
  const existingLocationsBySheet = await fetchExistingRecordLocations(
    spreadsheetId,
    targetSheets,
    accessToken,
    fetchImpl
  );
  let processed = 0;
  let skippedDuplicates = 0;
  let failed = 0;
  const results = [];
  for (const op of eligibleOps) {
    try {
      const recordId = extractRecordIdFromOp(op);
      const action = (op.action || "create").toLowerCase();
      let sheetLoc = existingLocationsBySheet.get(op.sheetName);
      if (!sheetLoc) {
        sheetLoc = { idToRow: /* @__PURE__ */ new Map(), maxRow: 1 };
        existingLocationsBySheet.set(op.sheetName, sheetLoc);
      }
      if (action === "update") {
        const existingRow = recordId ? sheetLoc.idToRow.get(recordId) : void 0;
        if (existingRow) {
          const updateRes = await fetchImpl(
            `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(
              `${escapeSheetTitleForA1(op.sheetName)}!A${existingRow}`
            )}?valueInputOption=USER_ENTERED`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                values: [Array.isArray(op.payload) ? op.payload : [recordId]]
              })
            }
          );
          if (!updateRes.ok) {
            const errMsg = await readErrorText(updateRes);
            throw new Error(`Failed to update row in ${op.sheetName}: ${errMsg}`);
          }
        } else {
          const appendRes = await fetchImpl(
            `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(
              `${escapeSheetTitleForA1(op.sheetName)}!A2:append`
            )}?valueInputOption=USER_ENTERED`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                values: [Array.isArray(op.payload) ? op.payload : [recordId]]
              })
            }
          );
          if (!appendRes.ok) {
            const errMsg = await readErrorText(appendRes);
            throw new Error(`Failed to append row for update in ${op.sheetName}: ${errMsg}`);
          }
          if (recordId) {
            sheetLoc.maxRow++;
            sheetLoc.idToRow.set(recordId, sheetLoc.maxRow);
          }
        }
      } else if (action === "delete") {
        const existingRow = recordId ? sheetLoc.idToRow.get(recordId) : void 0;
        if (existingRow) {
          const clearRes = await fetchImpl(
            `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(
              `${escapeSheetTitleForA1(op.sheetName)}!A${existingRow}:Z${existingRow}`
            )}:clear`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({})
            }
          );
          if (!clearRes.ok) {
            const batchClearRes = await fetchImpl(
              `${SHEETS_API_BASE}/${spreadsheetId}/values:batchClear`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  ranges: [`${escapeSheetTitleForA1(op.sheetName)}!A${existingRow}:Z${existingRow}`]
                })
              }
            );
            if (!batchClearRes.ok) {
              const errMsg = await readErrorText(batchClearRes);
              throw new Error(`Failed to delete row in ${op.sheetName}: ${errMsg}`);
            }
          }
          sheetLoc.idToRow.delete(recordId);
        }
      } else {
        if (recordId && sheetLoc.idToRow.has(recordId)) {
          skippedDuplicates++;
          processed++;
          results.push({
            id: op.id,
            status: "completed",
            attempts: op.attempts || 0,
            nextRetryAt: null,
            errorMessage: null,
            skippedDuplicate: true
          });
          continue;
        }
        const appendRes = await fetchImpl(
          `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(
            `${escapeSheetTitleForA1(op.sheetName)}!A2:append`
          )}?valueInputOption=USER_ENTERED`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              values: [Array.isArray(op.payload) ? op.payload : [recordId]]
            })
          }
        );
        if (!appendRes.ok) {
          const errMsg = await readErrorText(appendRes);
          throw new Error(errMsg);
        }
        if (recordId) {
          sheetLoc.maxRow++;
          sheetLoc.idToRow.set(recordId, sheetLoc.maxRow);
        }
      }
      processed++;
      results.push({
        id: op.id,
        status: "completed",
        attempts: op.attempts || 0,
        nextRetryAt: null,
        errorMessage: null
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Transmission failure";
      const nextAttempts = (op.attempts || 0) + 1;
      const isTerminal = nextAttempts >= 5;
      const backoffMs = computeBackoffDelayMs(nextAttempts);
      failed++;
      results.push({
        id: op.id,
        status: isTerminal ? "failed" : "pending",
        attempts: nextAttempts,
        nextRetryAt: isTerminal ? null : nowMs + backoffMs,
        errorMessage: errorMsg
      });
    }
  }
  return {
    processed,
    skippedDuplicates,
    failed,
    results
  };
}

// src/lib/sheetHub/urlParser.ts
var VALID_SPREADSHEET_ID_REGEX = /^[a-zA-Z0-9_-]{15,128}$/;
var ALLOWED_HOSTS = /* @__PURE__ */ new Set(["docs.google.com", "sheets.google.com"]);
function extractGid(url) {
  const fromQuery = url.searchParams.get("gid");
  if (fromQuery !== null && /^\d+$/.test(fromQuery.trim())) {
    return Number(fromQuery.trim());
  }
  const hash = (url.hash || "").replace(/^#/, "");
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    const fromHash = hashParams.get("gid");
    if (fromHash !== null && /^\d+$/.test(fromHash.trim())) {
      return Number(fromHash.trim());
    }
    const directMatch = hash.match(/(?:^|&)gid=(\d+)(?:&|$)/);
    if (directMatch) {
      return Number(directMatch[1]);
    }
  }
  return null;
}
function parseGoogleSheetUrl(rawInput) {
  const trimmed = typeof rawInput === "string" ? rawInput.trim() : "";
  if (!trimmed) {
    return {
      ok: false,
      code: "EMPTY_URL",
      error: "Please paste a Google Sheets URL."
    };
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      code: "INVALID_URL_FORMAT",
      error: "Invalid URL format. Expected a link like https://docs.google.com/spreadsheets/d/<spreadsheet-id>/edit"
    };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return {
      ok: false,
      code: "UNSUPPORTED_PROTOCOL",
      error: "Only http(s) Google Sheets URLs are supported."
    };
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    return {
      ok: false,
      code: "UNSUPPORTED_HOST",
      error: `Unsupported host "${parsed.hostname}". Please paste a docs.google.com Google Sheets URL.`
    };
  }
  if (/^\/spreadsheets(?:\/u\/\d+)?\/d\/e\//i.test(parsed.pathname)) {
    return {
      ok: false,
      code: "PUBLISHED_WEB_LINK_UNSUPPORTED",
      error: "Published-to-web (/d/e/2PACX-...) links cannot be accessed through the Google Sheets API. Please paste the standard spreadsheet URL (/spreadsheets/d/<id>/edit)."
    };
  }
  const match = parsed.pathname.match(
    /^\/spreadsheets(?:\/u\/\d+)?\/d\/([^/]+)(?:\/.*)?$/i
  );
  if (!match || !match[1]) {
    return {
      ok: false,
      code: "MISSING_SPREADSHEET_ID",
      error: "Could not find a Google Spreadsheet ID in this URL. Expected /spreadsheets/d/<id>."
    };
  }
  const spreadsheetId = decodeURIComponent(match[1]).trim();
  if (!VALID_SPREADSHEET_ID_REGEX.test(spreadsheetId)) {
    return {
      ok: false,
      code: "INVALID_SPREADSHEET_ID",
      error: "The spreadsheet ID in this URL is malformed or too short."
    };
  }
  const gid = extractGid(parsed);
  const canonicalUrl = gid !== null ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${gid}` : `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  return {
    ok: true,
    spreadsheetId,
    gid,
    canonicalUrl
  };
}
function isValidGoogleSpreadsheetId(id) {
  return typeof id === "string" && VALID_SPREADSHEET_ID_REGEX.test(id.trim());
}

// server/universalSheetsWorker.ts
init_schemaDetector();
init_localXlsxParser();
var SHEETS_API_BASE2 = "https://sheets.googleapis.com/v4/spreadsheets";
var PUBLIC_EXPORT_BASE = "https://docs.google.com/spreadsheets/d";
var MAX_INSPECT_TABS = 25;
var MAX_PULL_TABS = 25;
var DEFAULT_PREVIEW_ROWS = 50;
var MAX_PREVIEW_ROWS = 100;
var SheetHubWorkerError = class extends Error {
  constructor(message, status = 502, code = "SHEETS_UPSTREAM_ERROR", details) {
    super(message);
    this.name = "SheetHubWorkerError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
};
function escapeSheetTitleForA12(title) {
  const escaped = title.replace(/'/g, "''");
  return `'${escaped}'`;
}
async function parseGoogleApiError(res) {
  const status = res.status;
  try {
    const text = await res.text();
    if (!text) return { status, message: `HTTP ${status} ${res.statusText}` };
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error) {
        const msg = parsed.error.message || `HTTP ${status} ${res.statusText}`;
        const firstErr = parsed.error.errors?.[0];
        const reason = firstErr?.reason || parsed.error.status;
        const domain = firstErr?.domain;
        return {
          status,
          message: msg,
          reason,
          domain,
          rawText: text.slice(0, 400)
        };
      }
    } catch {
    }
    return { status, message: text.slice(0, 400), rawText: text.slice(0, 400) };
  } catch {
    return { status, message: `HTTP ${status} ${res.statusText}` };
  }
}
async function readGoogleError(res) {
  return parseGoogleApiError(res);
}
function mapGoogleHttpError(status, errorDetail, context) {
  const message = typeof errorDetail === "string" ? errorDetail : errorDetail.message;
  const reason = typeof errorDetail === "object" ? errorDetail.reason : void 0;
  if (status === 401 || /\b401\b|UNAUTHENTICATED|invalid authentication credentials|Invalid Credentials/i.test(
    message
  )) {
    return new SheetHubWorkerError(
      `Google Sheets authorization expired or missing (${context}): ${message}`,
      401,
      "SHEETS_AUTH_REQUIRED",
      { status, reason, context, originalMessage: message }
    );
  }
  if (status === 403 || /\b403\b|PERMISSION_DENIED|The caller does not have permission|insufficient authentication scopes/i.test(
    message
  )) {
    const reasonDetail = reason ? ` (Reason: ${reason})` : "";
    return new SheetHubWorkerError(
      `Access denied to Google Spreadsheet (${context}): ${message}${reasonDetail}. Verify that your authorized Google account has permission to view this spreadsheet and that Google Sheets API access is granted.`,
      403,
      "SHEETS_PERMISSION_DENIED",
      { status, reason, context, originalMessage: message }
    );
  }
  if (status === 404) {
    return new SheetHubWorkerError(
      `Google Spreadsheet not found or inaccessible (${context}): ${message}. Verify the spreadsheet URL or ID. For private spreadsheets, use "Browse My Google Drive" to select the file.`,
      404,
      "SPREADSHEET_NOT_FOUND",
      { status, reason, context, originalMessage: message }
    );
  }
  if (status === 429) {
    return new SheetHubWorkerError(
      `Google Sheets API rate limit reached (${context}): ${message}. Please retry shortly.`,
      429,
      "SHEETS_RATE_LIMITED",
      { status, reason, context, originalMessage: message }
    );
  }
  return new SheetHubWorkerError(
    `Google Sheets API error (${context}, HTTP ${status}): ${message}`,
    status >= 400 && status < 500 ? status : 502,
    "SHEETS_UPSTREAM_ERROR",
    { status, reason, context, originalMessage: message }
  );
}
function convertGoogleCellToMeta(cell) {
  if (!cell) {
    return { value: null };
  }
  const eff = cell.effectiveValue;
  const entered = cell.userEnteredValue;
  const formula = typeof entered?.formulaValue === "string" ? entered.formulaValue : null;
  let value = null;
  let isBooleanCell = false;
  if (eff) {
    if (typeof eff.boolValue === "boolean") {
      value = eff.boolValue;
      isBooleanCell = true;
    } else if (typeof eff.numberValue === "number" && Number.isFinite(eff.numberValue)) {
      value = eff.numberValue;
    } else if (typeof eff.stringValue === "string") {
      value = eff.stringValue;
    }
  } else if (entered) {
    if (typeof entered.boolValue === "boolean") {
      value = entered.boolValue;
      isBooleanCell = true;
    } else if (typeof entered.numberValue === "number" && Number.isFinite(entered.numberValue)) {
      value = entered.numberValue;
    } else if (typeof entered.stringValue === "string") {
      value = entered.stringValue;
    }
  }
  const dvCondition = cell.dataValidation?.condition;
  const dataValidationType = typeof dvCondition?.type === "string" ? dvCondition.type : null;
  const dataValidationValues = Array.isArray(dvCondition?.values) ? dvCondition.values.map((v) => typeof v?.userEnteredValue === "string" ? v.userEnteredValue : "").filter(Boolean) : void 0;
  const numberFormatType = cell.userEnteredFormat?.numberFormat?.type || null;
  return {
    value,
    formattedValue: typeof cell.formattedValue === "string" ? cell.formattedValue : null,
    formula,
    numberFormatType,
    dataValidationType,
    ...dataValidationValues && dataValidationValues.length > 0 ? { dataValidationValues } : {},
    isBooleanCell: isBooleanCell || dataValidationType === "BOOLEAN"
  };
}
function normalizeBatchScalar(raw) {
  if (raw === null || raw === void 0) return null;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") return raw;
  return String(raw);
}
function resolveSpreadsheetIdInput(input) {
  if (typeof input.spreadsheetUrl === "string" && input.spreadsheetUrl.trim()) {
    const parsed = parseGoogleSheetUrl(input.spreadsheetUrl);
    if (!parsed.ok) {
      throw new SheetHubWorkerError(parsed.error, 400, parsed.code);
    }
    return {
      spreadsheetId: parsed.spreadsheetId,
      canonicalUrl: parsed.canonicalUrl
    };
  }
  const rawId = typeof input.spreadsheetId === "string" ? input.spreadsheetId.trim() : "";
  if (!isValidGoogleSpreadsheetId(rawId)) {
    throw new SheetHubWorkerError(
      "A valid Google Spreadsheet ID or Google Sheets URL is required.",
      400,
      "INVALID_SPREADSHEET_ID"
    );
  }
  return {
    spreadsheetId: rawId,
    canonicalUrl: `https://docs.google.com/spreadsheets/d/${rawId}/edit`
  };
}
async function inspectSpreadsheet(input, accessToken, fetchImpl = fetch) {
  if (!accessToken || !accessToken.trim()) {
    throw new SheetHubWorkerError(
      "Google Sheets authorization token is required.",
      401,
      "SHEETS_AUTH_REQUIRED"
    );
  }
  const { spreadsheetId, canonicalUrl } = resolveSpreadsheetIdInput(input);
  const previewRows = Math.max(
    10,
    Math.min(MAX_PREVIEW_ROWS, Math.floor(input.previewRows || DEFAULT_PREVIEW_ROWS))
  );
  const metaFields = encodeURIComponent(
    "spreadsheetId,properties.title,sheets(properties(sheetId,title,sheetType,gridProperties))"
  );
  const metaRes = await fetchImpl(`${SHEETS_API_BASE2}/${spreadsheetId}?fields=${metaFields}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!metaRes.ok) {
    const errMsg = await readGoogleError(metaRes);
    throw mapGoogleHttpError(metaRes.status, errMsg, "inspect metadata");
  }
  let metaJson;
  try {
    metaJson = await metaRes.json();
  } catch {
    throw new SheetHubWorkerError(
      "Malformed JSON response while reading spreadsheet metadata.",
      502,
      "MALFORMED_SHEETS_RESPONSE"
    );
  }
  if (!metaJson || typeof metaJson !== "object" || !Array.isArray(metaJson.sheets)) {
    throw new SheetHubWorkerError(
      "Spreadsheet metadata response was missing the sheets array.",
      502,
      "MALFORMED_SHEETS_RESPONSE"
    );
  }
  const title = metaJson.properties?.title || "Untitled Spreadsheet";
  const gridSheets = metaJson.sheets.filter((s) => s?.properties && typeof s.properties.title === "string" && typeof s.properties.sheetId === "number").filter((s) => !s.properties?.sheetType || s.properties.sheetType === "GRID").slice(0, MAX_INSPECT_TABS);
  if (gridSheets.length === 0) {
    return {
      spreadsheetId,
      title,
      canonicalUrl,
      tabs: [],
      summary: {
        totalTabs: 0,
        dataTabs: 0,
        overviewTabs: 0,
        emptyTabs: 0,
        requiresUserConfirmation: true
      },
      inspectedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  const rangeQuery = gridSheets.map((s) => {
    const tabTitle = s.properties.title;
    const maxCols = Math.min(26, Math.max(1, s.properties?.gridProperties?.columnCount || 26));
    const endColLetter = String.fromCharCode(64 + maxCols);
    const maxRows = Math.min(previewRows, Math.max(1, s.properties?.gridProperties?.rowCount || previewRows));
    return `ranges=${encodeURIComponent(`${escapeSheetTitleForA12(tabTitle)}!A1:${endColLetter}${maxRows}`)}`;
  }).join("&");
  const gridFields = encodeURIComponent(
    "spreadsheetId,sheets(properties(sheetId,title,gridProperties),data.rowData.values(userEnteredValue,effectiveValue,formattedValue,userEnteredFormat.numberFormat,dataValidation))"
  );
  const gridRes = await fetchImpl(
    `${SHEETS_API_BASE2}/${spreadsheetId}?includeGridData=true&${rangeQuery}&fields=${gridFields}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );
  if (!gridRes.ok) {
    const errMsg = await readGoogleError(gridRes);
    throw mapGoogleHttpError(gridRes.status, errMsg, "inspect grid preview");
  }
  let gridJson;
  try {
    gridJson = await gridRes.json();
  } catch {
    throw new SheetHubWorkerError(
      "Malformed JSON response while reading spreadsheet preview grid.",
      502,
      "MALFORMED_SHEETS_RESPONSE"
    );
  }
  if (!gridJson || !Array.isArray(gridJson.sheets)) {
    throw new SheetHubWorkerError(
      "Spreadsheet grid response was malformed.",
      502,
      "MALFORMED_SHEETS_RESPONSE"
    );
  }
  const inspectionInputs = gridJson.sheets.map((sheetObj, idx) => {
    const props = sheetObj.properties || gridSheets[idx]?.properties || {};
    const rowData = sheetObj.data?.[0]?.rowData || [];
    const parsedRows = rowData.map(
      (r) => (r.values || []).map((cell) => convertGoogleCellToMeta(cell))
    );
    return {
      sheetId: typeof props.sheetId === "number" ? props.sheetId : idx,
      sheetTitle: typeof props.title === "string" ? props.title : `Sheet ${idx + 1}`,
      rowCount: props.gridProperties?.rowCount,
      columnCount: props.gridProperties?.columnCount,
      rows: parsedRows
    };
  });
  const workbookSchema = detectWorkbookSchema(inspectionInputs);
  return {
    spreadsheetId,
    title,
    canonicalUrl,
    tabs: workbookSchema.tabs,
    summary: {
      totalTabs: workbookSchema.tabs.length,
      dataTabs: workbookSchema.dataTabCount,
      overviewTabs: workbookSchema.overviewTabCount,
      emptyTabs: workbookSchema.emptyTabCount,
      requiresUserConfirmation: workbookSchema.requiresUserConfirmation
    },
    inspectedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function pullSpreadsheetTabs(input, accessToken, fetchImpl = fetch) {
  if (!accessToken || !accessToken.trim()) {
    throw new SheetHubWorkerError(
      "Google Sheets authorization token is required.",
      401,
      "SHEETS_AUTH_REQUIRED"
    );
  }
  const { spreadsheetId } = resolveSpreadsheetIdInput({ spreadsheetId: input.spreadsheetId });
  if (!Array.isArray(input.tabs) || input.tabs.length === 0) {
    throw new SheetHubWorkerError(
      "At least one tab must be specified to pull data.",
      400,
      "INVALID_PULL_REQUEST"
    );
  }
  const requestedTabs = input.tabs.slice(0, MAX_PULL_TABS);
  for (const tab of requestedTabs) {
    if (!tab || typeof tab.sheetTitle !== "string" || !tab.sheetTitle.trim()) {
      throw new SheetHubWorkerError(
        "Each tab entry must include a non-empty sheetTitle.",
        400,
        "INVALID_PULL_REQUEST"
      );
    }
  }
  const metaFields = encodeURIComponent("spreadsheetId,properties.title,sheets(properties(sheetId,title))");
  const metaRes = await fetchImpl(`${SHEETS_API_BASE2}/${spreadsheetId}?fields=${metaFields}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!metaRes.ok) {
    const errMsg = await readGoogleError(metaRes);
    throw mapGoogleHttpError(metaRes.status, errMsg, "pull metadata");
  }
  let metaJson;
  try {
    metaJson = await metaRes.json();
  } catch {
    throw new SheetHubWorkerError(
      "Malformed JSON response while reading spreadsheet metadata for pull.",
      502,
      "MALFORMED_SHEETS_RESPONSE"
    );
  }
  if (!metaJson || !Array.isArray(metaJson.sheets)) {
    throw new SheetHubWorkerError(
      "Spreadsheet metadata response was missing sheets.",
      502,
      "MALFORMED_SHEETS_RESPONSE"
    );
  }
  const sheetIdByTitle = /* @__PURE__ */ new Map();
  for (const sh of metaJson.sheets) {
    if (typeof sh.properties?.title === "string" && typeof sh.properties.sheetId === "number") {
      sheetIdByTitle.set(sh.properties.title, sh.properties.sheetId);
    }
  }
  const a1Ranges = requestedTabs.map(
    (t) => t.range && t.range.trim() ? t.range.trim() : `${escapeSheetTitleForA12(t.sheetTitle.trim())}!A1:Z1000`
  );
  const rangesParam = a1Ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
  const [valuesRes, formulasRes] = await Promise.all([
    fetchImpl(
      `${SHEETS_API_BASE2}/${spreadsheetId}/values:batchGet?${rangesParam}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    ),
    fetchImpl(
      `${SHEETS_API_BASE2}/${spreadsheetId}/values:batchGet?${rangesParam}&valueRenderOption=FORMULA`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
  ]);
  if (!valuesRes.ok) {
    const errMsg = await readGoogleError(valuesRes);
    throw mapGoogleHttpError(valuesRes.status, errMsg, "pull values");
  }
  if (!formulasRes.ok) {
    const errMsg = await readGoogleError(formulasRes);
    throw mapGoogleHttpError(formulasRes.status, errMsg, "pull formulas");
  }
  let valuesJson;
  let formulasJson;
  try {
    valuesJson = await valuesRes.json();
    formulasJson = await formulasRes.json();
  } catch {
    throw new SheetHubWorkerError(
      "Malformed JSON response from Google Sheets values:batchGet.",
      502,
      "MALFORMED_SHEETS_RESPONSE"
    );
  }
  if (!Array.isArray(valuesJson?.valueRanges) || !Array.isArray(formulasJson?.valueRanges)) {
    throw new SheetHubWorkerError(
      "Google Sheets values:batchGet response was missing valueRanges.",
      502,
      "MALFORMED_SHEETS_RESPONSE"
    );
  }
  const tabs = requestedTabs.map((reqTab, idx) => {
    const valRange = valuesJson.valueRanges?.[idx];
    const formRange = formulasJson.valueRanges?.[idx];
    const rawValues = Array.isArray(valRange?.values) ? valRange.values : [];
    const rawFormulas = Array.isArray(formRange?.values) ? formRange.values : [];
    const headerRowIndex = Math.max(1, Math.floor(reqTab.headerRowIndex || 1));
    const headerRow0 = headerRowIndex - 1;
    const rawHeaders = Array.isArray(rawValues[headerRow0]) ? rawValues[headerRow0] : [];
    const headers = rawHeaders.map((h) => h === null || h === void 0 ? "" : String(h).trim());
    const formulaColCounts = /* @__PURE__ */ new Map();
    const normalizedRows = [];
    for (let r = headerRow0 + 1; r < rawValues.length; r++) {
      const rowVals = Array.isArray(rawValues[r]) ? rawValues[r] : [];
      const rowForms = Array.isArray(rawFormulas[r]) ? rawFormulas[r] : [];
      const colLen = Math.max(headers.length, rowVals.length, rowForms.length);
      const scalars = [];
      const formulaCols = [];
      let hasAnyValue = false;
      for (let c = 0; c < colLen; c++) {
        const val = normalizeBatchScalar(rowVals[c]);
        const formRaw = rowForms[c];
        const isFormula = typeof formRaw === "string" && formRaw.trim().startsWith("=");
        if (isFormula) {
          formulaCols.push(c);
          formulaColCounts.set(c, (formulaColCounts.get(c) || 0) + 1);
        }
        if (val !== null && (typeof val !== "string" || val.trim() !== "")) {
          hasAnyValue = true;
        }
        scalars.push(val);
      }
      if (hasAnyValue || formulaCols.length > 0) {
        normalizedRows.push({
          sheetRowNumber: r + 1,
          values: scalars,
          formulaColumns: formulaCols
        });
      }
    }
    const formulaColumnIndices = Array.from(formulaColCounts.entries()).filter(([, count]) => count > 0).map(([colIdx]) => colIdx).sort((a, b) => a - b);
    return {
      sheetTitle: reqTab.sheetTitle.trim(),
      sheetId: sheetIdByTitle.get(reqTab.sheetTitle.trim()) ?? reqTab.sheetId ?? null,
      range: valRange?.range || a1Ranges[idx],
      headers,
      headerRowIndex,
      rows: normalizedRows,
      formulaColumnIndices,
      totalRows: normalizedRows.length
    };
  });
  return {
    spreadsheetId,
    title: metaJson.properties?.title || "Untitled Spreadsheet",
    tabs,
    pulledAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function extractTitleFromContentDisposition(header) {
  if (!header) return "Public Google Spreadsheet";
  const utf8Match = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      const decoded = decodeURIComponent(utf8Match[1].trim().replace(/^["']|["']$/g, ""));
      return decoded.replace(/\.xlsx$/i, "").trim() || "Public Google Spreadsheet";
    } catch {
    }
  }
  const basicMatch = header.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i);
  const rawName = (basicMatch?.[1] || basicMatch?.[2] || "").trim().replace(/^["']|["']$/g, "");
  return rawName.replace(/\.xlsx$/i, "").trim() || "Public Google Spreadsheet";
}
async function fetchPublicSpreadsheetXlsx(spreadsheetId, fetchImpl = fetch) {
  const exportUrl = `${PUBLIC_EXPORT_BASE}/${encodeURIComponent(spreadsheetId)}/export?format=xlsx`;
  const res = await fetchImpl(exportUrl, {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*"
    }
  });
  if (res.status === 404) {
    throw new SheetHubWorkerError(
      'Google Spreadsheet not found or not shared publicly. If this is a private spreadsheet in your Google Drive, choose Option B (Google Sign-In) or "Browse My Google Drive" below. If you want to use Public Link, set sharing to "Anyone with the link (Viewer)" in Google Sheets.',
      404,
      "SPREADSHEET_NOT_FOUND"
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new SheetHubWorkerError(
      'This Google Spreadsheet is private or restricted. Either change sharing to "Anyone with the link (Viewer)" or authorize with Google.',
      403,
      "SHEET_PRIVATE_AUTH_REQUIRED"
    );
  }
  if (!res.ok) {
    const errMsg = await readGoogleError(res);
    throw new SheetHubWorkerError(
      `Unable to read public spreadsheet (HTTP ${res.status}): ${errMsg}`,
      res.status >= 400 && res.status < 500 ? res.status : 502,
      "SHEETS_UPSTREAM_ERROR"
    );
  }
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  if (contentType.includes("text/html") || !isZipBuffer(buffer)) {
    throw new SheetHubWorkerError(
      'This Google Spreadsheet requires sign-in (it is not shared publicly). Set sharing to "Anyone with the link \u2192 Viewer" to import without sign-in, or click Authorize with Google.',
      403,
      "SHEET_PRIVATE_AUTH_REQUIRED"
    );
  }
  let parsedTabs;
  try {
    parsedTabs = parseXlsxBuffer(buffer);
  } catch (err) {
    throw new SheetHubWorkerError(
      `Failed to parse exported spreadsheet workbook: ${err instanceof Error ? err.message : String(err)}`,
      502,
      "MALFORMED_SHEETS_RESPONSE"
    );
  }
  const title = extractTitleFromContentDisposition(res.headers.get("content-disposition"));
  return { title, tabs: parsedTabs.slice(0, MAX_INSPECT_TABS) };
}
async function inspectPublicSpreadsheet(input, fetchImpl = fetch) {
  const { spreadsheetId, canonicalUrl } = resolveSpreadsheetIdInput(input);
  const previewRows = Math.max(
    10,
    Math.min(MAX_PREVIEW_ROWS, Math.floor(input.previewRows || DEFAULT_PREVIEW_ROWS))
  );
  const { title, tabs: rawTabs } = await fetchPublicSpreadsheetXlsx(spreadsheetId, fetchImpl);
  const boundedInputs = rawTabs.map((tab) => ({
    sheetId: tab.sheetId,
    sheetTitle: tab.sheetTitle,
    rowCount: tab.rows.length,
    columnCount: tab.rows.reduce((max, r) => Math.max(max, r.length), 0),
    rows: tab.rows.slice(0, previewRows)
  }));
  const workbookSchema = detectWorkbookSchema(boundedInputs);
  return {
    spreadsheetId,
    title,
    canonicalUrl,
    tabs: workbookSchema.tabs,
    summary: {
      totalTabs: workbookSchema.tabs.length,
      dataTabs: workbookSchema.dataTabCount,
      overviewTabs: workbookSchema.overviewTabCount,
      emptyTabs: workbookSchema.emptyTabCount,
      requiresUserConfirmation: workbookSchema.requiresUserConfirmation
    },
    inspectedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function pullPublicSpreadsheetTabs(input, fetchImpl = fetch) {
  const { spreadsheetId } = resolveSpreadsheetIdInput({ spreadsheetId: input.spreadsheetId });
  if (!Array.isArray(input.tabs) || input.tabs.length === 0) {
    throw new SheetHubWorkerError(
      "At least one tab must be specified to pull data.",
      400,
      "INVALID_PULL_REQUEST"
    );
  }
  const requestedTabs = input.tabs.slice(0, MAX_PULL_TABS);
  const { title, tabs: parsedTabs } = await fetchPublicSpreadsheetXlsx(spreadsheetId, fetchImpl);
  const detectedSchema = detectWorkbookSchema(
    parsedTabs.map((t) => ({ ...t, rows: t.rows.slice(0, DEFAULT_PREVIEW_ROWS) }))
  );
  const pulledTabs = requestedTabs.map((reqTab) => {
    const normalizedReqTitle = (reqTab.sheetTitle || "").trim().toLowerCase();
    const matchedTab = parsedTabs.find((pt) => pt.sheetTitle.trim().toLowerCase() === normalizedReqTitle) || (typeof reqTab.sheetId === "number" ? parsedTabs.find((pt) => pt.sheetId === reqTab.sheetId) : void 0);
    if (!matchedTab) {
      return {
        sheetTitle: reqTab.sheetTitle.trim(),
        sheetId: reqTab.sheetId ?? null,
        range: `${escapeSheetTitleForA12(reqTab.sheetTitle.trim())}!A1:Z1000`,
        headers: [],
        headerRowIndex: reqTab.headerRowIndex || 1,
        rows: [],
        formulaColumnIndices: [],
        totalRows: 0
      };
    }
    const detectedTab = detectedSchema.tabs.find((dt) => dt.sheetId === matchedTab.sheetId);
    const headerRowIndex = Math.max(1, Math.floor(reqTab.headerRowIndex || detectedTab?.headerRowIndex || 1));
    const headerRow0 = headerRowIndex - 1;
    const headerCells = matchedTab.rows[headerRow0] || [];
    const headers = headerCells.map(
      (cell) => cell?.value === null || cell?.value === void 0 ? "" : String(cell.value).trim()
    );
    const formulaColCounts = /* @__PURE__ */ new Map();
    const normalizedRows = [];
    for (let r = headerRow0 + 1; r < matchedTab.rows.length; r++) {
      const cellRow = matchedTab.rows[r] || [];
      const colLen = Math.max(headers.length, cellRow.length);
      const scalars = [];
      const formulaCols = [];
      let hasAnyValue = false;
      for (let c = 0; c < colLen; c++) {
        const cell = cellRow[c];
        const val = normalizeBatchScalar(cell?.value ?? null);
        if (cell?.formula) {
          formulaCols.push(c);
          formulaColCounts.set(c, (formulaColCounts.get(c) || 0) + 1);
        }
        if (val !== null && (typeof val !== "string" || val.trim() !== "")) {
          hasAnyValue = true;
        }
        scalars.push(val);
      }
      if (hasAnyValue || formulaCols.length > 0) {
        normalizedRows.push({
          sheetRowNumber: r + 1,
          values: scalars,
          formulaColumns: formulaCols
        });
      }
    }
    const formulaColumnIndices = Array.from(formulaColCounts.entries()).filter(([, count]) => count > 0).map(([colIdx]) => colIdx).sort((a, b) => a - b);
    return {
      sheetTitle: matchedTab.sheetTitle,
      sheetId: matchedTab.sheetId,
      range: `${escapeSheetTitleForA12(matchedTab.sheetTitle)}!A1:Z${Math.max(1, matchedTab.rows.length)}`,
      headers,
      headerRowIndex,
      rows: normalizedRows,
      formulaColumnIndices,
      totalRows: normalizedRows.length
    };
  });
  return {
    spreadsheetId,
    title,
    tabs: pulledTabs,
    pulledAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// server/routes.ts
import crypto8 from "crypto";

// server/firebaseAdmin.ts
import { getApps, initializeApp, cert, applicationDefault, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import fs5 from "fs";
import path4 from "path";
var initializedApp = null;
var activeMetadata = {
  clientEmail: null,
  projectId: null,
  hasCredential: false,
  source: "none"
};
function normalizePrivateKey(rawKey) {
  if (typeof rawKey !== "string") return null;
  let key = rawKey.trim();
  if (key.includes("\\n")) {
    key = key.replace(/\\n/g, "\n");
  }
  return key;
}
function parseAndValidateServiceAccount(rawObj, expectedProjectId) {
  if (!rawObj || typeof rawObj !== "object" || Array.isArray(rawObj)) {
    console.warn("[FirebaseAdmin] Malformed service account payload: expected a JSON object.");
    return null;
  }
  const obj = rawObj;
  const credProjectId = typeof obj.project_id === "string" ? obj.project_id.trim() : null;
  const clientEmail = typeof obj.client_email === "string" ? obj.client_email.trim() : null;
  const normalizedKey = normalizePrivateKey(obj.private_key);
  if (credProjectId && expectedProjectId && credProjectId !== expectedProjectId) {
    throw new Error(
      `[FIREBASE_CREDENTIAL_PROJECT_MISMATCH] Service Account credential project_id ('${credProjectId}') does not match expected server project ('${expectedProjectId}'). Cross-project credential usage is strictly forbidden.`
    );
  }
  if (!clientEmail || !clientEmail.includes("@") || !clientEmail.includes("gserviceaccount.com")) {
    console.warn("[FirebaseAdmin] Service account credential is missing a valid client_email address.");
    return null;
  }
  if (!normalizedKey || !normalizedKey.includes("BEGIN PRIVATE KEY")) {
    console.warn("[FirebaseAdmin] Service account credential is missing a valid PEM private_key.");
    return null;
  }
  const normalizedObj = {
    ...obj,
    project_id: credProjectId || expectedProjectId,
    client_email: clientEmail,
    private_key: normalizedKey
  };
  return {
    credentialObj: normalizedObj,
    metadata: {
      clientEmail,
      projectId: credProjectId || expectedProjectId,
      hasCredential: true,
      source: "none"
      // Set by caller
    }
  };
}
function getFirebaseAdminApp() {
  if (initializedApp) {
    return initializedApp;
  }
  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    initializedApp = existingApps[0];
    return initializedApp;
  }
  const projectId = resolveServerFirebaseProjectId();
  let credential = null;
  let source = "none";
  let clientEmail = null;
  const rawEnvJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const rawEnvKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  const candidateEnv = rawEnvJson || rawEnvKey;
  const envSource = rawEnvJson ? "env_json" : "env_key";
  if (candidateEnv) {
    try {
      if (candidateEnv.startsWith("{")) {
        const parsed = JSON.parse(candidateEnv);
        const result = parseAndValidateServiceAccount(parsed, projectId);
        if (result) {
          credential = cert(result.credentialObj);
          source = envSource;
          clientEmail = result.metadata.clientEmail;
        }
      } else {
        const resolvedPath = path4.resolve(process.cwd(), candidateEnv);
        if (fs5.existsSync(resolvedPath)) {
          const fileContent = JSON.parse(fs5.readFileSync(resolvedPath, "utf8"));
          const result = parseAndValidateServiceAccount(fileContent, projectId);
          if (result) {
            credential = cert(result.credentialObj);
            source = "file";
            clientEmail = result.metadata.clientEmail;
          }
        } else {
          console.warn("[FirebaseAdmin] Service account file path specified in environment does not exist.");
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("[FIREBASE_CREDENTIAL_PROJECT_MISMATCH]")) {
        throw err;
      }
      console.warn("[FirebaseAdmin] Failed to parse service account credential from environment. Verify valid JSON.");
    }
  }
  const isGcpRuntime = Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE || process.env.GAE_SERVICE || process.env.FUNCTION_NAME
  );
  if (!credential && isGcpRuntime) {
    try {
      credential = applicationDefault();
      source = "adc";
    } catch {
      source = "project_id_only";
    }
  } else if (!credential) {
    source = "project_id_only";
  }
  activeMetadata = {
    clientEmail,
    projectId,
    hasCredential: Boolean(credential),
    source
  };
  const appOptions = {
    projectId,
    ...credential ? { credential } : {}
  };
  initializedApp = initializeApp(appOptions);
  return initializedApp;
}
function getAdminFirestore() {
  const app2 = getFirebaseAdminApp();
  const db = getFirestore(app2);
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
  }
  return db;
}
function getAdminMessaging() {
  const app2 = getFirebaseAdminApp();
  return getMessaging(app2);
}
function hasServiceAccountCredentials() {
  getFirebaseAdminApp();
  return activeMetadata.hasCredential && activeMetadata.source !== "project_id_only";
}

// server/v18StorageService.ts
init_db();
var StorageOwnershipError = class extends Error {
  constructor(message = "Access denied: Record is owned by another user") {
    super(message);
    this.status = 403;
    this.code = "FORBIDDEN_OWNERSHIP_VIOLATION";
    this.name = "StorageOwnershipError";
  }
};
var StorageNotFoundError = class extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.status = 404;
    this.code = "NOT_FOUND";
    this.name = "StorageNotFoundError";
  }
};
function stripUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== void 0) {
      if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
        out[k] = stripUndefined(v);
      } else {
        out[k] = v;
      }
    }
  }
  return out;
}
function wrapDbCall(fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof StorageOwnershipError || err instanceof StorageNotFoundError) throw err;
    if (err?.message?.includes("Forbidden")) {
      throw new StorageOwnershipError(err.message);
    }
    throw err;
  }
}
var V18StorageService = class {
  constructor(customFirestore) {
    this.customFirestore = null;
    if (customFirestore) {
      this.customFirestore = customFirestore;
    }
  }
  setFirestoreForTesting(db) {
    this.customFirestore = db;
  }
  isFirestoreAuthoritative() {
    if (this.customFirestore) return true;
    return hasServiceAccountCredentials();
  }
  get firestore() {
    if (this.customFirestore) return this.customFirestore;
    return getAdminFirestore();
  }
  // -------------------------------------------------------------
  // 1. Skill Nodes
  // -------------------------------------------------------------
  async getSkillNodes(userId) {
    if (!userId) return [];
    if (this.isFirestoreAuthoritative()) {
      try {
        const snap = await this.firestore.collection("users").doc(userId).collection("skill_nodes").get();
        return snap.docs.map((d) => d.data());
      } catch (err) {
        console.warn(`[V18Storage] Firestore getSkillNodes failed for ${userId}:`, err);
      }
    }
    return dbService.getSkillNodes(userId);
  }
  async getSkillNode(userId, id) {
    if (!userId || !id) return null;
    if (this.isFirestoreAuthoritative()) {
      try {
        const docSnap = await this.firestore.collection("users").doc(userId).collection("skill_nodes").doc(id).get();
        if (docSnap.exists) {
          return docSnap.data();
        }
      } catch (err) {
        console.warn(`[V18Storage] Firestore getSkillNode failed for ${userId}/${id}:`, err);
      }
    }
    return wrapDbCall(() => dbService.getSkillNode(id, userId));
  }
  async saveSkillNode(userId, node) {
    if (!userId) throw new StorageOwnershipError("Authentication required");
    const safeNode = {
      ...node,
      userId
    };
    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore.collection("users").doc(userId).collection("skill_nodes").doc(safeNode.id);
      const existingDoc = await docRef.get();
      if (existingDoc.exists) {
        const data = existingDoc.data();
        if (data.userId && data.userId !== userId) {
          throw new StorageOwnershipError();
        }
      }
      await docRef.set(stripUndefined(safeNode), { merge: true });
    }
    wrapDbCall(() => dbService.saveSkillNode(safeNode));
    return safeNode;
  }
  async updateSkillNode(userId, id, updates) {
    const existing = await this.getSkillNode(userId, id);
    if (!existing) {
      throw new StorageNotFoundError(`Skill node with id ${id} not found`);
    }
    const merged = {
      ...existing,
      ...updates,
      id: existing.id,
      userId
    };
    return this.saveSkillNode(userId, merged);
  }
  async deleteSkillNode(userId, id) {
    let deleted = false;
    const localDeleted = wrapDbCall(() => dbService.deleteSkillNode(id, userId));
    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore.collection("users").doc(userId).collection("skill_nodes").doc(id);
      const existing = await docRef.get();
      if (existing.exists) {
        await docRef.delete();
        deleted = true;
      }
    }
    return deleted || localDeleted;
  }
  // -------------------------------------------------------------
  // 2. Whiteboard Drawings
  // -------------------------------------------------------------
  async getWhiteboardDrawings(userId) {
    if (!userId) return [];
    if (this.isFirestoreAuthoritative()) {
      try {
        const snap = await this.firestore.collection("users").doc(userId).collection("whiteboard_drawings").orderBy("createdAt", "desc").get();
        return snap.docs.map((d) => d.data());
      } catch (err) {
        try {
          const snap = await this.firestore.collection("users").doc(userId).collection("whiteboard_drawings").get();
          return snap.docs.map((d) => d.data());
        } catch {
          console.warn(`[V18Storage] Firestore getWhiteboardDrawings failed for ${userId}`);
        }
      }
    }
    return dbService.getWhiteboardDrawings(userId);
  }
  async getWhiteboardDrawing(userId, id) {
    if (!userId || !id) return null;
    if (this.isFirestoreAuthoritative()) {
      try {
        const docSnap = await this.firestore.collection("users").doc(userId).collection("whiteboard_drawings").doc(id).get();
        if (docSnap.exists) {
          return docSnap.data();
        }
      } catch (err) {
        console.warn(`[V18Storage] Firestore getWhiteboardDrawing failed for ${userId}/${id}:`, err);
      }
    }
    return wrapDbCall(() => dbService.getWhiteboardDrawing(id, userId));
  }
  async saveWhiteboardDrawing(userId, drawing) {
    if (!userId) throw new StorageOwnershipError("Authentication required");
    const safeDrawing = {
      ...drawing,
      userId
    };
    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore.collection("users").doc(userId).collection("whiteboard_drawings").doc(safeDrawing.id);
      const existingDoc = await docRef.get();
      if (existingDoc.exists) {
        const data = existingDoc.data();
        if (data.userId && data.userId !== userId) {
          throw new StorageOwnershipError();
        }
      }
      await docRef.set(stripUndefined(safeDrawing), { merge: true });
    }
    wrapDbCall(() => dbService.saveWhiteboardDrawing(safeDrawing));
    return safeDrawing;
  }
  async updateWhiteboardDrawing(userId, id, updates) {
    const existing = await this.getWhiteboardDrawing(userId, id);
    if (!existing) {
      throw new StorageNotFoundError(`Whiteboard drawing with id ${id} not found`);
    }
    const merged = {
      ...existing,
      ...updates,
      id: existing.id,
      userId,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return this.saveWhiteboardDrawing(userId, merged);
  }
  async deleteWhiteboardDrawing(userId, id) {
    let deleted = false;
    const localDeleted = wrapDbCall(() => dbService.deleteWhiteboardDrawing(id, userId));
    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore.collection("users").doc(userId).collection("whiteboard_drawings").doc(id);
      const existing = await docRef.get();
      if (existing.exists) {
        await docRef.delete();
        deleted = true;
      }
    }
    return deleted || localDeleted;
  }
  // -------------------------------------------------------------
  // 3. Exam Hall Simulator Sessions
  // -------------------------------------------------------------
  async getExamSimulations(userId) {
    if (!userId) return [];
    if (this.isFirestoreAuthoritative()) {
      try {
        const snap = await this.firestore.collection("users").doc(userId).collection("exam_simulations").get();
        return snap.docs.map((d) => d.data());
      } catch (err) {
        console.warn(`[V18Storage] Firestore getExamSimulations failed for ${userId}:`, err);
      }
    }
    return dbService.getExamSimulations(userId);
  }
  async getExamSimulation(userId, id) {
    if (!userId || !id) return null;
    if (this.isFirestoreAuthoritative()) {
      try {
        const docSnap = await this.firestore.collection("users").doc(userId).collection("exam_simulations").doc(id).get();
        if (docSnap.exists) {
          return docSnap.data();
        }
      } catch (err) {
        console.warn(`[V18Storage] Firestore getExamSimulation failed for ${userId}/${id}:`, err);
      }
    }
    return wrapDbCall(() => dbService.getExamSimulation(id, userId));
  }
  async saveExamSimulation(userId, sim) {
    if (!userId) throw new StorageOwnershipError("Authentication required");
    const safeSim = {
      ...sim,
      userId
    };
    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore.collection("users").doc(userId).collection("exam_simulations").doc(safeSim.id);
      const existingDoc = await docRef.get();
      if (existingDoc.exists) {
        const data = existingDoc.data();
        if (data.userId && data.userId !== userId) {
          throw new StorageOwnershipError();
        }
      }
      await docRef.set(stripUndefined(safeSim), { merge: true });
    }
    wrapDbCall(() => dbService.saveExamSimulation(safeSim));
    return safeSim;
  }
  async updateExamSimulation(userId, id, updates) {
    const existing = await this.getExamSimulation(userId, id);
    if (!existing) {
      throw new StorageNotFoundError(`Exam simulation with id ${id} not found`);
    }
    const merged = {
      ...existing,
      ...updates,
      id: existing.id,
      userId
    };
    return this.saveExamSimulation(userId, merged);
  }
  async deleteExamSimulation(userId, id) {
    let deleted = false;
    const localDeleted = wrapDbCall(() => dbService.deleteExamSimulation(id, userId));
    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore.collection("users").doc(userId).collection("exam_simulations").doc(id);
      const existing = await docRef.get();
      if (existing.exists) {
        await docRef.delete();
        deleted = true;
      }
    }
    return deleted || localDeleted;
  }
  // -------------------------------------------------------------
  // 4. Decision Journal
  // -------------------------------------------------------------
  async getDecisionEntries(userId) {
    if (!userId) return [];
    if (this.isFirestoreAuthoritative()) {
      try {
        const snap = await this.firestore.collection("users").doc(userId).collection("decision_entries").orderBy("createdAt", "desc").get();
        return snap.docs.map((d) => d.data());
      } catch {
        try {
          const snap = await this.firestore.collection("users").doc(userId).collection("decision_entries").get();
          return snap.docs.map((d) => d.data());
        } catch (err) {
          console.warn(`[V18Storage] Firestore getDecisionEntries failed for ${userId}:`, err);
        }
      }
    }
    return dbService.getDecisionEntries(userId);
  }
  async getDecisionEntry(userId, id) {
    if (!userId || !id) return null;
    if (this.isFirestoreAuthoritative()) {
      try {
        const docSnap = await this.firestore.collection("users").doc(userId).collection("decision_entries").doc(id).get();
        if (docSnap.exists) {
          return docSnap.data();
        }
      } catch (err) {
        console.warn(`[V18Storage] Firestore getDecisionEntry failed for ${userId}/${id}:`, err);
      }
    }
    return wrapDbCall(() => dbService.getDecisionEntry(id, userId));
  }
  async saveDecisionEntry(userId, entry) {
    if (!userId) throw new StorageOwnershipError("Authentication required");
    const safeEntry = {
      ...entry,
      userId
    };
    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore.collection("users").doc(userId).collection("decision_entries").doc(safeEntry.id);
      const existingDoc = await docRef.get();
      if (existingDoc.exists) {
        const data = existingDoc.data();
        if (data.userId && data.userId !== userId) {
          throw new StorageOwnershipError();
        }
      }
      await docRef.set(stripUndefined(safeEntry), { merge: true });
    }
    wrapDbCall(() => dbService.saveDecisionEntry(safeEntry));
    return safeEntry;
  }
  async updateDecisionEntry(userId, id, updates) {
    const existing = await this.getDecisionEntry(userId, id);
    if (!existing) {
      throw new StorageNotFoundError(`Decision entry with id ${id} not found`);
    }
    const merged = {
      ...existing,
      ...updates,
      id: existing.id,
      userId
    };
    return this.saveDecisionEntry(userId, merged);
  }
  async deleteDecisionEntry(userId, id) {
    let deleted = false;
    const localDeleted = wrapDbCall(() => dbService.deleteDecisionEntry(id, userId));
    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore.collection("users").doc(userId).collection("decision_entries").doc(id);
      const existing = await docRef.get();
      if (existing.exists) {
        await docRef.delete();
        deleted = true;
      }
    }
    return deleted || localDeleted;
  }
  // -------------------------------------------------------------
  // 5. Doomscroll Tax Jar
  // -------------------------------------------------------------
  async getDoomscrollLogs(userId) {
    if (!userId) return [];
    if (this.isFirestoreAuthoritative()) {
      try {
        const snap = await this.firestore.collection("users").doc(userId).collection("doomscroll_logs").orderBy("createdAt", "desc").get();
        return snap.docs.map((d) => d.data());
      } catch {
        try {
          const snap = await this.firestore.collection("users").doc(userId).collection("doomscroll_logs").get();
          return snap.docs.map((d) => d.data());
        } catch (err) {
          console.warn(`[V18Storage] Firestore getDoomscrollLogs failed for ${userId}:`, err);
        }
      }
    }
    return dbService.getDoomscrollLogs(userId);
  }
  async getDoomscrollLog(userId, id) {
    if (!userId || !id) return null;
    if (this.isFirestoreAuthoritative()) {
      try {
        const docSnap = await this.firestore.collection("users").doc(userId).collection("doomscroll_logs").doc(id).get();
        if (docSnap.exists) {
          return docSnap.data();
        }
      } catch (err) {
        console.warn(`[V18Storage] Firestore getDoomscrollLog failed for ${userId}/${id}:`, err);
      }
    }
    return wrapDbCall(() => dbService.getDoomscrollLog(id, userId));
  }
  async saveDoomscrollLog(userId, log) {
    if (!userId) throw new StorageOwnershipError("Authentication required");
    const safeLog = {
      ...log,
      userId
    };
    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore.collection("users").doc(userId).collection("doomscroll_logs").doc(safeLog.id);
      await docRef.set(stripUndefined(safeLog), { merge: true });
    }
    wrapDbCall(() => dbService.saveDoomscrollLog(safeLog));
    return safeLog;
  }
  async updateDoomscrollLog(userId, id, updates) {
    const existing = await this.getDoomscrollLog(userId, id);
    if (!existing) {
      throw new StorageNotFoundError(`Doomscroll log with id ${id} not found`);
    }
    const merged = {
      ...existing,
      ...updates,
      id: existing.id,
      userId
    };
    return this.saveDoomscrollLog(userId, merged);
  }
  async deleteDoomscrollLog(userId, id) {
    let deleted = false;
    const localDeleted = wrapDbCall(() => dbService.deleteDoomscrollLog(id, userId));
    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore.collection("users").doc(userId).collection("doomscroll_logs").doc(id);
      const existing = await docRef.get();
      if (existing.exists) {
        await docRef.delete();
        deleted = true;
      }
    }
    return deleted || localDeleted;
  }
  async clearDoomscrollLogs(userId) {
    if (!userId) return false;
    if (this.isFirestoreAuthoritative()) {
      try {
        const snap = await this.firestore.collection("users").doc(userId).collection("doomscroll_logs").get();
        const batch = this.firestore.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      } catch (err) {
        console.warn(`[V18Storage] Firestore clearDoomscrollLogs failed for ${userId}:`, err);
      }
    }
    return dbService.clearDoomscrollLogs(userId);
  }
  // -------------------------------------------------------------
  // 6. Life Milestones (Life-in-Weeks Grid)
  // -------------------------------------------------------------
  async getLifeMilestones(userId) {
    if (!userId) return [];
    if (this.isFirestoreAuthoritative()) {
      try {
        const snap = await this.firestore.collection("users").doc(userId).collection("life_milestones").get();
        return snap.docs.map((d) => d.data());
      } catch (err) {
        console.warn(`[V18Storage] Firestore getLifeMilestones failed for ${userId}:`, err);
      }
    }
    return dbService.getLifeMilestones(userId);
  }
  async getLifeMilestone(userId, id) {
    if (!userId || !id) return null;
    if (this.isFirestoreAuthoritative()) {
      try {
        const docSnap = await this.firestore.collection("users").doc(userId).collection("life_milestones").doc(id).get();
        if (docSnap.exists) {
          return docSnap.data();
        }
      } catch (err) {
        console.warn(`[V18Storage] Firestore getLifeMilestone failed for ${userId}/${id}:`, err);
      }
    }
    return wrapDbCall(() => dbService.getLifeMilestone(id, userId));
  }
  async saveLifeMilestone(userId, milestone) {
    if (!userId) throw new StorageOwnershipError("Authentication required");
    const safeMilestone = {
      ...milestone,
      userId
    };
    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore.collection("users").doc(userId).collection("life_milestones").doc(safeMilestone.id);
      const existingDoc = await docRef.get();
      if (existingDoc.exists) {
        const data = existingDoc.data();
        if (data.userId && data.userId !== userId) {
          throw new StorageOwnershipError();
        }
      }
      await docRef.set(stripUndefined(safeMilestone), { merge: true });
    }
    wrapDbCall(() => dbService.saveLifeMilestone(safeMilestone));
    return safeMilestone;
  }
  async updateLifeMilestone(userId, id, updates) {
    const existing = await this.getLifeMilestone(userId, id);
    if (!existing) {
      throw new StorageNotFoundError(`Life milestone with id ${id} not found`);
    }
    const merged = {
      ...existing,
      ...updates,
      id: existing.id
    };
    return this.saveLifeMilestone(userId, merged);
  }
  async deleteLifeMilestone(userId, id) {
    let deleted = false;
    const localDeleted = wrapDbCall(() => dbService.deleteLifeMilestone(id, userId));
    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore.collection("users").doc(userId).collection("life_milestones").doc(id);
      const existing = await docRef.get();
      if (existing.exists) {
        await docRef.delete();
        deleted = true;
      }
    }
    return deleted || localDeleted;
  }
  // -------------------------------------------------------------
  // 7. Time Capsule Letters
  // -------------------------------------------------------------
  async getTimeCapsules(userId) {
    if (!userId) return [];
    if (this.isFirestoreAuthoritative()) {
      try {
        const snap = await this.firestore.collection("users").doc(userId).collection("time_capsules").orderBy("createdAt", "desc").get();
        return snap.docs.map((d) => d.data());
      } catch {
        try {
          const snap = await this.firestore.collection("users").doc(userId).collection("time_capsules").get();
          return snap.docs.map((d) => d.data());
        } catch (err) {
          console.warn(`[V18Storage] Firestore getTimeCapsules failed for ${userId}:`, err);
        }
      }
    }
    return dbService.getTimeCapsules(userId);
  }
  async getTimeCapsule(userId, id) {
    if (!userId || !id) return null;
    if (this.isFirestoreAuthoritative()) {
      try {
        const docSnap = await this.firestore.collection("users").doc(userId).collection("time_capsules").doc(id).get();
        if (docSnap.exists) {
          return docSnap.data();
        }
      } catch (err) {
        console.warn(`[V18Storage] Firestore getTimeCapsule failed for ${userId}/${id}:`, err);
      }
    }
    return wrapDbCall(() => dbService.getTimeCapsule(id, userId));
  }
  async saveTimeCapsule(userId, capsule) {
    if (!userId) throw new StorageOwnershipError("Authentication required");
    const safeCapsule = {
      ...capsule,
      userId
    };
    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore.collection("users").doc(userId).collection("time_capsules").doc(safeCapsule.id);
      const existingDoc = await docRef.get();
      if (existingDoc.exists) {
        const data = existingDoc.data();
        if (data.userId && data.userId !== userId) {
          throw new StorageOwnershipError();
        }
      }
      await docRef.set(stripUndefined(safeCapsule), { merge: true });
    }
    wrapDbCall(() => dbService.saveTimeCapsule(safeCapsule));
    return safeCapsule;
  }
  async updateTimeCapsule(userId, id, updates) {
    const existing = await this.getTimeCapsule(userId, id);
    if (!existing) {
      throw new StorageNotFoundError(`Time capsule with id ${id} not found`);
    }
    const merged = {
      ...existing,
      ...updates,
      id: existing.id,
      userId
    };
    return this.saveTimeCapsule(userId, merged);
  }
  async deleteTimeCapsule(userId, id) {
    let deleted = false;
    const localDeleted = wrapDbCall(() => dbService.deleteTimeCapsule(id, userId));
    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore.collection("users").doc(userId).collection("time_capsules").doc(id);
      const existing = await docRef.get();
      if (existing.exists) {
        await docRef.delete();
        deleted = true;
      }
    }
    return deleted || localDeleted;
  }
  // -------------------------------------------------------------
  // 8. Emergency & Asset Profile
  // -------------------------------------------------------------
  async getEmergencyProfile(userId) {
    if (!userId) return null;
    if (this.isFirestoreAuthoritative()) {
      try {
        const docSnap = await this.firestore.collection("users").doc(userId).collection("emergency_profile").doc("default").get();
        if (docSnap.exists) {
          return docSnap.data();
        }
      } catch (err) {
        console.warn(`[V18Storage] Firestore getEmergencyProfile failed for ${userId}:`, err);
      }
    }
    return dbService.getEmergencyProfile(userId);
  }
  async saveEmergencyProfile(userId, profile) {
    if (!userId) throw new StorageOwnershipError("Authentication required");
    const safeProfile = {
      ...profile,
      id: `ep_${userId}`,
      userId
    };
    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore.collection("users").doc(userId).collection("emergency_profile").doc("default");
      await docRef.set(stripUndefined(safeProfile), { merge: true });
    }
    wrapDbCall(() => dbService.saveEmergencyProfile(safeProfile));
    return safeProfile;
  }
  async deleteEmergencyProfile(userId) {
    if (!userId) return false;
    let deleted = false;
    const localDeleted = wrapDbCall(() => dbService.deleteEmergencyProfile(userId));
    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore.collection("users").doc(userId).collection("emergency_profile").doc("default");
      const existing = await docRef.get();
      if (existing.exists) {
        await docRef.delete();
        deleted = true;
      }
    }
    return deleted || localDeleted;
  }
};
var v18StorageService = new V18StorageService();

// server/sheetHubWriteWorker.ts
var SHEETS_API_BASE3 = "https://sheets.googleapis.com/v4/spreadsheets";
var MAX_CELL_UPDATES_PER_BATCH = 500;
var MAX_ROW_NUMBER = 1e6;
var A1_COL_PATTERN = /^[A-Z]{1,3}$/;
function escapeSheetTitleForA13(title) {
  const escaped = title.replace(/'/g, "''");
  return `'${escaped}'`;
}
function normalizeCellWriteValue(value) {
  if (value === null || value === void 0) return "";
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : "";
  }
  return String(value);
}
function parseGoogleErrorMessage(rawText, status) {
  if (!rawText) return `Google Sheets API write error (${status})`;
  try {
    const parsed = JSON.parse(rawText);
    if (parsed?.error?.message) {
      return parsed.error.message;
    }
  } catch {
  }
  return rawText.slice(0, 300);
}
async function pushSheetHubCellUpdates(input, accessToken, fetchImpl = fetch) {
  const token = (accessToken || "").trim();
  if (!token) {
    throw new SheetHubWorkerError(
      "Google Sheets edit authorization is required before pushing changes.",
      401,
      "SHEETS_AUTH_REQUIRED"
    );
  }
  const spreadsheetId = (input.spreadsheetId || "").trim();
  if (!isValidGoogleSpreadsheetId(spreadsheetId)) {
    throw new SheetHubWorkerError(
      "Invalid Google Spreadsheet ID.",
      400,
      "INVALID_SPREADSHEET_ID"
    );
  }
  if (!Array.isArray(input.updates) || input.updates.length === 0) {
    throw new SheetHubWorkerError(
      "At least one cell update is required.",
      400,
      "INVALID_PUSH_REQUEST"
    );
  }
  if (input.updates.length > MAX_CELL_UPDATES_PER_BATCH) {
    throw new SheetHubWorkerError(
      `Too many cell updates in a single batch (max ${MAX_CELL_UPDATES_PER_BATCH}).`,
      400,
      "INVALID_PUSH_REQUEST"
    );
  }
  const dedupedRanges = /* @__PURE__ */ new Map();
  for (const item of input.updates) {
    const sheetTitle = typeof item?.sheetTitle === "string" ? item.sheetTitle.trim() : "";
    if (!sheetTitle) {
      throw new SheetHubWorkerError(
        "Each cell update must specify a valid sheetTitle.",
        400,
        "INVALID_PUSH_REQUEST"
      );
    }
    const rowNumber = Number(item?.rowNumber);
    if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > MAX_ROW_NUMBER) {
      throw new SheetHubWorkerError(
        `Invalid sheet row number "${String(item?.rowNumber)}" for tab "${sheetTitle}".`,
        400,
        "INVALID_PUSH_REQUEST"
      );
    }
    const colLetter = typeof item?.colLetter === "string" ? item.colLetter.trim().toUpperCase() : "";
    if (!A1_COL_PATTERN.test(colLetter)) {
      throw new SheetHubWorkerError(
        `Invalid A1 column letter "${String(item?.colLetter)}" for tab "${sheetTitle}".`,
        400,
        "INVALID_PUSH_REQUEST"
      );
    }
    const rawVal = item.value;
    if (rawVal !== null && rawVal !== void 0 && typeof rawVal !== "string" && typeof rawVal !== "number" && typeof rawVal !== "boolean") {
      throw new SheetHubWorkerError(
        `Unsupported cell value type for ${sheetTitle}!${colLetter}${rowNumber}.`,
        400,
        "INVALID_PUSH_REQUEST"
      );
    }
    const range = `${escapeSheetTitleForA13(sheetTitle)}!${colLetter}${rowNumber}`;
    dedupedRanges.set(range, {
      range,
      value: normalizeCellWriteValue(rawVal ?? null)
    });
  }
  const dataPayload = Array.from(dedupedRanges.values()).map((entry) => ({
    range: entry.range,
    majorDimension: "ROWS",
    values: [[entry.value]]
  }));
  const url = `${SHEETS_API_BASE3}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      includeValuesInResponse: false,
      data: dataPayload
    })
  });
  if (!response.ok) {
    const rawText = await response.text().catch(() => "");
    const googleMsg = parseGoogleErrorMessage(rawText, response.status);
    if (response.status === 401) {
      throw new SheetHubWorkerError(
        "Google OAuth session expired. Please re-authorize Google Sheets edit access and retry.",
        401,
        "SHEETS_AUTH_REQUIRED"
      );
    }
    if (response.status === 403) {
      throw new SheetHubWorkerError(
        `Google Sheets write permission denied. Ensure you approved edit access and have Editor permissions on this spreadsheet. (${googleMsg})`,
        403,
        "SHEETS_WRITE_PERMISSION_DENIED"
      );
    }
    if (response.status === 404) {
      throw new SheetHubWorkerError(
        "Google Spreadsheet not found or no longer accessible.",
        404,
        "SPREADSHEET_NOT_FOUND"
      );
    }
    if (response.status === 429) {
      throw new SheetHubWorkerError(
        "Google Sheets API rate limit reached. Your change is saved locally \u2014 retry pushing in a few seconds.",
        429,
        "SHEETS_RATE_LIMITED"
      );
    }
    throw new SheetHubWorkerError(
      `Failed to update Google Sheet: ${googleMsg}`,
      response.status >= 400 && response.status < 600 ? response.status : 502,
      "SHEETS_WRITE_FAILED"
    );
  }
  const resultJson = await response.json().catch(() => ({}));
  return {
    spreadsheetId,
    updatedCells: typeof resultJson.totalUpdatedCells === "number" ? resultJson.totalUpdatedCells : dataPayload.length,
    updatedRangeCount: Array.isArray(resultJson.responses) ? resultJson.responses.length : dataPayload.length,
    pushedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// server/durableIdempotencyLedger.ts
import fs6 from "node:fs";
import path5 from "node:path";
init_vaultBackendService();
var DEFAULT_LEASE_TIMEOUT_MS = 6e4;
var DEFAULT_COLLECTION_NAME = "driveIdempotency";
function toFsValue(v) {
  if (v === null || v === void 0) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toFsValue) } };
  }
  if (typeof v === "object") {
    const fields = {};
    for (const [k, val] of Object.entries(v)) {
      if (val !== void 0) fields[k] = toFsValue(val);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}
function fromFsValue(val) {
  if (!val || typeof val !== "object") return val;
  if ("stringValue" in val) return val.stringValue;
  if ("integerValue" in val) return parseInt(val.integerValue, 10);
  if ("doubleValue" in val) return val.doubleValue;
  if ("booleanValue" in val) return val.booleanValue;
  if ("nullValue" in val) return null;
  if ("arrayValue" in val) {
    return (val.arrayValue.values || []).map(fromFsValue);
  }
  if ("mapValue" in val) {
    const res = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      res[k] = fromFsValue(v);
    }
    return res;
  }
  return val;
}
function toFsDocFields(record) {
  const fields = {};
  for (const [k, v] of Object.entries(record)) {
    if (v !== void 0) {
      fields[k] = toFsValue(v);
    }
  }
  return fields;
}
function fromFsDoc(doc) {
  const fields = doc?.fields || {};
  const res = {};
  for (const [k, v] of Object.entries(fields)) {
    res[k] = fromFsValue(v);
  }
  return res;
}
var FirestoreTransactionalLedgerRepository = class {
  constructor(config) {
    this.storageType = "firestore";
    if (isProductionEnvironment() && config?.emulatorHost) {
      throw new SheetHubWorkerError(
        "CRITICAL CONFIG SAFETY ERROR: FIRESTORE_EMULATOR_HOST cannot be used in production.",
        500,
        "EMULATOR_IN_PRODUCTION_VIOLATION"
      );
    }
    this.emulatorHost = isProductionEnvironment() ? null : config?.emulatorHost !== void 0 ? config.emulatorHost : process.env.FIRESTORE_EMULATOR_HOST ?? null;
    this.customAuthToken = config?.authToken ?? null;
    this.fetchImpl = config?.fetchImpl ?? fetch;
    const resolvedProject = isProductionEnvironment() ? config?.projectId || PRODUCTION_PROJECT_ID : config?.projectId || process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || (this.emulatorHost ? "test-rules-project" : PRODUCTION_PROJECT_ID);
    if (resolvedProject === "seismic-codex-m01dl") {
      throw new SheetHubWorkerError(
        "CRITICAL CONFIG SAFETY ERROR: seismic-codex-m01dl is strictly forbidden for production idempotency ledger. Target must be focus-flow-by-atif.",
        500,
        "INVALID_LEDGER_PROJECT"
      );
    }
    if (isProductionEnvironment() && resolvedProject !== PRODUCTION_PROJECT_ID) {
      throw new SheetHubWorkerError(
        `CRITICAL CONFIG SAFETY ERROR: Production idempotency ledger must strictly target ${PRODUCTION_PROJECT_ID}, received '${resolvedProject}'.`,
        500,
        "INVALID_LEDGER_PROJECT"
      );
    }
    this.projectId = resolvedProject;
    this.databaseId = config?.databaseId || process.env.FIRESTORE_DATABASE_ID || "(default)";
  }
  getBaseUrl() {
    if (this.emulatorHost) {
      return `http://${this.emulatorHost}/v1/projects/${this.projectId}/databases/${this.databaseId}/documents`;
    }
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/${this.databaseId}/documents`;
  }
  async getAuthHeader() {
    if (this.customAuthToken) {
      return `Bearer ${this.customAuthToken}`;
    }
    if (this.emulatorHost) {
      return "Bearer owner_emulator_token";
    }
    const sa = resolveServiceAccount();
    if (!sa) {
      throw new SheetHubWorkerError(
        "Firestore persistence credentials unavailable in serverless environment. Drive copy rejected to prevent unrecorded operations.",
        503,
        "PERSISTENT_STORAGE_UNAVAILABLE"
      );
    }
    try {
      const { getGoogleOAuthAccessToken: getGoogleOAuthAccessToken2 } = await Promise.resolve().then(() => (init_vaultBackendService(), vaultBackendService_exports));
      const token = await getGoogleOAuthAccessToken2(sa);
      return `Bearer ${token}`;
    } catch {
      throw new SheetHubWorkerError(
        "Failed to obtain Cloud Firestore authorization token for idempotency ledger.",
        503,
        "PERSISTENT_STORAGE_UNAVAILABLE"
      );
    }
  }
  /**
   * Begins a Firestore readWrite transaction.
   */
  async beginTransaction() {
    const auth = await this.getAuthHeader();
    const url = `${this.getBaseUrl()}:beginTransaction`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ options: { readWrite: {} } })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new SheetHubWorkerError(
        `Failed to begin Firestore transaction for idempotency ledger (${res.status}): ${text}`,
        503,
        "PERSISTENT_STORAGE_UNAVAILABLE"
      );
    }
    const data = await res.json();
    return data.transaction;
  }
  /**
   * Fetches an existing operation document inside an active transaction.
   */
  async getDocumentInTransaction(operationId, txId) {
    const auth = await this.getAuthHeader();
    const docPath = `${DEFAULT_COLLECTION_NAME}/${encodeURIComponent(operationId)}`;
    const url = `${this.getBaseUrl()}/${docPath}?transaction=${encodeURIComponent(txId)}`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: { Authorization: auth }
    });
    if (res.status === 404) {
      return { doc: null };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 409) {
        throw new SheetHubWorkerError("Firestore transaction conflict contention.", 409, "TRANSACTION_CONTENTION");
      }
      throw new SheetHubWorkerError(
        `Firestore read error during idempotency transaction (${res.status}): ${text}`,
        503,
        "PERSISTENT_STORAGE_UNAVAILABLE"
      );
    }
    const raw = await res.json();
    return {
      doc: fromFsDoc(raw),
      rawDocName: raw.name,
      updateTime: raw.updateTime
    };
  }
  /**
   * Commits an atomic write to the operation document within the transaction.
   */
  async commitWrite(operationId, record, txId, currentDocumentCondition) {
    const auth = await this.getAuthHeader();
    const url = `${this.getBaseUrl()}:commit`;
    const docName = `projects/${this.projectId}/databases/${this.databaseId}/documents/${DEFAULT_COLLECTION_NAME}/${operationId}`;
    const writeOp = {
      update: {
        name: docName,
        fields: toFsDocFields(record)
      }
    };
    if (currentDocumentCondition) {
      writeOp.currentDocument = currentDocumentCondition;
    }
    const commitRes = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        transaction: txId,
        writes: [writeOp]
      })
    });
    if (!commitRes.ok) {
      const errText = await commitRes.text().catch(() => "");
      if (commitRes.status === 409) {
        throw new SheetHubWorkerError(
          "Concurrent transaction conflict while updating idempotency record.",
          409,
          "TRANSACTION_CONTENTION"
        );
      }
      throw new SheetHubWorkerError(
        `Failed to commit Firestore idempotency transaction (${commitRes.status}): ${errText}`,
        503,
        "PERSISTENT_STORAGE_UNAVAILABLE"
      );
    }
  }
  /**
   * Rollback transaction on non-fatal catch.
   */
  async rollback(txId) {
    try {
      const auth = await this.getAuthHeader();
      await this.fetchImpl(`${this.getBaseUrl()}:rollback`, {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ transaction: txId })
      });
    } catch {
    }
  }
  /**
   * Atomically claims an operation lease in Firestore using an ACID transaction.
   */
  async claimOperation(input) {
    const opId = (input.operationId || "").trim();
    if (!opId) {
      throw new SheetHubWorkerError("operationId is required for durable duplication.", 400, "INVALID_OPERATION_ID");
    }
    const ownerUid = (input.ownerUid || "").trim();
    if (!ownerUid) {
      throw new SheetHubWorkerError("ownerUid is required for durable duplication.", 400, "INVALID_OWNER_UID");
    }
    const sourceId = (input.sourceSpreadsheetId || "").trim();
    if (!sourceId) {
      throw new SheetHubWorkerError("sourceSpreadsheetId is required for durable duplication.", 400, "INVALID_SPREADSHEET_ID");
    }
    const leaseDuration = input.leaseTimeoutMs && input.leaseTimeoutMs > 0 ? input.leaseTimeoutMs : DEFAULT_LEASE_TIMEOUT_MS;
    const now = Date.now();
    const isoNow = new Date(now).toISOString();
    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      const txId = await this.beginTransaction();
      try {
        const { doc: existing, updateTime } = await this.getDocumentInTransaction(opId, txId);
        if (!existing) {
          const newRecord = {
            operationId: opId,
            ownerUid,
            sourceSpreadsheetId: sourceId,
            targetTitle: (input.targetTitle || "").trim() || `FocusFlow Copy \u2014 ${sourceId.slice(0, 8)}`,
            status: "PROCESSING",
            driveFileId: null,
            driveUrl: null,
            nativeSheetId: null,
            claimedAt: now,
            leaseExpiresAt: now + leaseDuration,
            leaseGeneration: 1,
            attempts: 1,
            lastErrorCode: null,
            errorMessage: null,
            reconciledAt: null,
            createdAt: isoNow,
            updatedAt: isoNow,
            completedAt: null
          };
          await this.commitWrite(opId, newRecord, txId, { exists: false });
          return { record: newRecord, action: "claimed" };
        }
        if (existing.ownerUid && existing.ownerUid !== ownerUid) {
          await this.rollback(txId);
          throw new SheetHubWorkerError(
            `Operation owner mismatch. Operation "${opId}" was initiated by user "${existing.ownerUid}" but requested by "${ownerUid}".`,
            403,
            "OPERATION_OWNER_MISMATCH"
          );
        }
        if (existing.sourceSpreadsheetId && existing.sourceSpreadsheetId !== sourceId) {
          await this.rollback(txId);
          throw new SheetHubWorkerError(
            `Operation source spreadsheet mismatch. Operation "${opId}" is bound to spreadsheet "${existing.sourceSpreadsheetId}" but requested for "${sourceId}".`,
            400,
            "OPERATION_SOURCE_MISMATCH"
          );
        }
        if (existing.status === "COMPLETED" || existing.status === "NATIVE_SHEET_CREATED" || existing.status === "DRIVE_COPY_CREATED" || existing.status === "COPY_CONFIRMED" || existing.status === "FAILED_REQUIRES_RECONCILIATION" && existing.driveFileId) {
          await this.rollback(txId);
          return { record: existing, action: "reused" };
        }
        if (existing.status === "COPY_OUTCOME_UNKNOWN" || existing.status === "COPY_REQUESTED") {
          if (existing.status === "COPY_REQUESTED" && now >= existing.leaseExpiresAt) {
            existing.status = "COPY_OUTCOME_UNKNOWN";
            existing.leaseGeneration = (existing.leaseGeneration || 1) + 1;
            existing.updatedAt = isoNow;
            await this.commitWrite(opId, existing, txId, updateTime ? { updateTime } : void 0);
          } else {
            await this.rollback(txId);
          }
          return { record: existing, action: "requires_ambiguous_resolution" };
        }
        if (existing.status === "PROCESSING") {
          if (now < existing.leaseExpiresAt) {
            await this.rollback(txId);
            throw new SheetHubWorkerError(
              `Duplication operation "${opId}" is currently being processed by another worker instance. Concurrent requests are locked until lease expiry.`,
              409,
              "CONCURRENT_OPERATION_IN_PROGRESS"
            );
          }
          existing.status = "PROCESSING";
          existing.claimedAt = now;
          existing.leaseExpiresAt = now + leaseDuration;
          existing.leaseGeneration = (existing.leaseGeneration || 1) + 1;
          existing.attempts += 1;
          existing.updatedAt = isoNow;
          await this.commitWrite(opId, existing, txId, updateTime ? { updateTime } : void 0);
          return { record: existing, action: "reclaimed" };
        }
        existing.status = "PROCESSING";
        existing.claimedAt = now;
        existing.leaseExpiresAt = now + leaseDuration;
        existing.leaseGeneration = (existing.leaseGeneration || 1) + 1;
        existing.attempts += 1;
        existing.updatedAt = isoNow;
        await this.commitWrite(opId, existing, txId, updateTime ? { updateTime } : void 0);
        return { record: existing, action: "reclaimed" };
      } catch (err) {
        if (err?.code === "TRANSACTION_CONTENTION" && attempts < 3) {
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 50));
          continue;
        }
        throw err;
      }
    }
    throw new SheetHubWorkerError(
      `Unable to claim operation lease for "${opId}" due to high concurrent transaction contention.`,
      409,
      "CONCURRENT_OPERATION_IN_PROGRESS"
    );
  }
  /**
   * Updates stage of an operation verifying lease generation.
   */
  async updateOperationStage(input) {
    const txId = await this.beginTransaction();
    try {
      const { doc: existing, updateTime } = await this.getDocumentInTransaction(input.operationId, txId);
      if (!existing) {
        await this.rollback(txId);
        throw new SheetHubWorkerError(`Operation "${input.operationId}" not found in ledger.`, 404, "OPERATION_NOT_FOUND");
      }
      if (input.leaseGeneration && existing.leaseGeneration !== input.leaseGeneration) {
        await this.rollback(txId);
        throw new SheetHubWorkerError(
          `Stale worker lease generation (${input.leaseGeneration} !== ${existing.leaseGeneration}) for operation "${input.operationId}". Another worker took over this operation.`,
          409,
          "STALE_LEASE_GENERATION"
        );
      }
      const iso = (/* @__PURE__ */ new Date()).toISOString();
      existing.status = input.status;
      if (input.driveFileId !== void 0) existing.driveFileId = input.driveFileId;
      if (input.driveUrl !== void 0) existing.driveUrl = input.driveUrl;
      if (input.nativeSheetId !== void 0) existing.nativeSheetId = input.nativeSheetId;
      if (input.lastErrorCode !== void 0) existing.lastErrorCode = input.lastErrorCode;
      if (input.errorMessage !== void 0) existing.errorMessage = input.errorMessage;
      existing.updatedAt = iso;
      await this.commitWrite(input.operationId, existing, txId, updateTime ? { updateTime } : void 0);
      return existing;
    } catch (err) {
      await this.rollback(txId);
      throw err;
    }
  }
  async recordCopyRequested(operationId, leaseGeneration) {
    return this.updateOperationStage({
      operationId,
      status: "COPY_REQUESTED",
      leaseGeneration
    });
  }
  async recordCopyConfirmed(input) {
    return this.updateOperationStage({
      operationId: input.operationId,
      status: "DRIVE_COPY_CREATED",
      leaseGeneration: input.leaseGeneration,
      driveFileId: input.driveFileId,
      driveUrl: input.driveUrl || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(input.driveFileId)}/edit`
    });
  }
  async recordCopyOutcomeUnknown(operationId, leaseGeneration, errorCode) {
    return this.updateOperationStage({
      operationId,
      status: "COPY_OUTCOME_UNKNOWN",
      leaseGeneration,
      lastErrorCode: errorCode || "NETWORK_OR_TIMEOUT_ERROR",
      errorMessage: "Drive duplicate request response was lost or timed out. Outcome is uncertain pending marker check."
    });
  }
  async reconcileOperation(input) {
    const txId = await this.beginTransaction();
    try {
      const { doc: existing, updateTime } = await this.getDocumentInTransaction(input.operationId, txId);
      if (!existing) {
        await this.rollback(txId);
        throw new SheetHubWorkerError(`Cannot reconcile: operation "${input.operationId}" not found.`, 404, "OPERATION_NOT_FOUND");
      }
      if (input.ownerUid && existing.ownerUid !== input.ownerUid) {
        await this.rollback(txId);
        throw new SheetHubWorkerError(
          `Cannot reconcile operation: owner mismatch (${input.ownerUid} !== ${existing.ownerUid}).`,
          403,
          "OPERATION_OWNER_MISMATCH"
        );
      }
      const iso = (/* @__PURE__ */ new Date()).toISOString();
      existing.status = input.status;
      if (input.driveFileId) existing.driveFileId = input.driveFileId;
      if (input.nativeSheetId) existing.nativeSheetId = input.nativeSheetId;
      if (input.errorMessage) existing.errorMessage = input.errorMessage;
      existing.reconciledAt = iso;
      existing.updatedAt = iso;
      if (input.status === "COMPLETED" && !existing.completedAt) {
        existing.completedAt = iso;
      }
      await this.commitWrite(input.operationId, existing, txId, updateTime ? { updateTime } : void 0);
      return existing;
    } catch (err) {
      await this.rollback(txId);
      throw err;
    }
  }
  async getOperation(operationId) {
    const auth = await this.getAuthHeader();
    const docPath = `${DEFAULT_COLLECTION_NAME}/${encodeURIComponent(operationId)}`;
    const url = `${this.getBaseUrl()}/${docPath}`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: { Authorization: auth }
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new SheetHubWorkerError(`Failed to fetch operation "${operationId}": HTTP ${res.status}`, 503, "PERSISTENT_STORAGE_UNAVAILABLE");
    }
    const raw = await res.json();
    return fromFsDoc(raw);
  }
  async recordFailed(opIdOrOptions, posErrorMessage) {
    const opId = typeof opIdOrOptions === "object" ? opIdOrOptions.operationId : opIdOrOptions;
    const errorMessage = typeof opIdOrOptions === "object" ? opIdOrOptions.errorMessage : posErrorMessage || "Unknown failure";
    return this.reconcileOperation({
      operationId: opId,
      status: "FAILED_REQUIRES_RECONCILIATION",
      errorMessage
    });
  }
};
function isProductionEnvironment() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV) || process.env.APP_ENV === "production";
}
var LocalFileLedgerRepository = class {
  constructor(customStoragePath) {
    this.storageType = "file";
    this.memoryRecords = /* @__PURE__ */ new Map();
    this.writeLock = Promise.resolve();
    if (isProductionEnvironment()) {
      throw new SheetHubWorkerError(
        "Local file idempotency ledger is strictly forbidden in production environments. Firestore transactional persistence is mandatory.",
        500,
        "PRODUCTION_STORAGE_VIOLATION"
      );
    }
    if (customStoragePath === null) {
      this.ledgerFilePath = null;
    } else if (customStoragePath) {
      this.ledgerFilePath = path5.resolve(customStoragePath);
      this.ensureDirectoryAndLoad();
    } else {
      const baseDir = process.env.DATA_DIR ? path5.resolve(process.env.DATA_DIR) : path5.resolve(process.cwd(), "data");
      this.ledgerFilePath = path5.resolve(baseDir, "idempotency_ledger.json");
      this.ensureDirectoryAndLoad();
    }
  }
  ensureDirectoryAndLoad() {
    if (!this.ledgerFilePath) return;
    try {
      const dir = path5.dirname(this.ledgerFilePath);
      if (!fs6.existsSync(dir)) {
        fs6.mkdirSync(dir, { recursive: true });
      }
      if (fs6.existsSync(this.ledgerFilePath)) {
        const raw = fs6.readFileSync(this.ledgerFilePath, "utf-8");
        if (raw.trim()) {
          const parsed = JSON.parse(raw);
          for (const [key, val] of Object.entries(parsed)) {
            this.memoryRecords.set(key, val);
          }
        }
      }
    } catch (err) {
      console.warn("[LocalFileLedger] Warning: Failed to load local ledger:", err);
    }
  }
  async persistToDisk() {
    if (!this.ledgerFilePath) return;
    this.writeLock = this.writeLock.then(async () => {
      const data = {};
      for (const [k, v] of this.memoryRecords.entries()) {
        data[k] = v;
      }
      const serialized = JSON.stringify(data, null, 2);
      const tempPath = `${this.ledgerFilePath}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
      const dir = path5.dirname(this.ledgerFilePath);
      if (!fs6.existsSync(dir)) {
        await fs6.promises.mkdir(dir, { recursive: true });
      }
      await fs6.promises.writeFile(tempPath, serialized, "utf-8");
      await fs6.promises.rename(tempPath, this.ledgerFilePath);
    }).catch((err) => {
      console.error("[LocalFileLedger] Error persisting to disk:", err);
    });
    await this.writeLock;
  }
  reloadFromDisk() {
    if (!this.ledgerFilePath) return;
    try {
      if (fs6.existsSync(this.ledgerFilePath)) {
        const raw = fs6.readFileSync(this.ledgerFilePath, "utf-8");
        if (raw.trim()) {
          const parsed = JSON.parse(raw);
          this.memoryRecords.clear();
          for (const [key, val] of Object.entries(parsed)) {
            this.memoryRecords.set(key, val);
          }
        }
      }
    } catch (err) {
      console.warn("[LocalFileLedger] Warning: reloadFromDisk failed:", err);
    }
  }
  async claimOperation(input) {
    const opId = (input.operationId || "").trim();
    if (!opId) throw new SheetHubWorkerError("operationId is required.", 400, "INVALID_OPERATION_ID");
    const ownerUid = (input.ownerUid || "").trim();
    if (!ownerUid) throw new SheetHubWorkerError("ownerUid is required.", 400, "INVALID_OWNER_UID");
    const sourceId = (input.sourceSpreadsheetId || "").trim();
    if (!sourceId) throw new SheetHubWorkerError("sourceSpreadsheetId is required.", 400, "INVALID_SPREADSHEET_ID");
    this.reloadFromDisk();
    const existing = this.memoryRecords.get(opId);
    const leaseDuration = input.leaseTimeoutMs && input.leaseTimeoutMs > 0 ? input.leaseTimeoutMs : DEFAULT_LEASE_TIMEOUT_MS;
    const now = Date.now();
    const isoNow = new Date(now).toISOString();
    if (!existing) {
      const newRecord = {
        operationId: opId,
        ownerUid,
        sourceSpreadsheetId: sourceId,
        targetTitle: (input.targetTitle || "").trim() || `FocusFlow Copy \u2014 ${sourceId.slice(0, 8)}`,
        status: "PROCESSING",
        driveFileId: null,
        driveUrl: null,
        nativeSheetId: null,
        claimedAt: now,
        leaseExpiresAt: now + leaseDuration,
        leaseGeneration: 1,
        attempts: 1,
        lastErrorCode: null,
        errorMessage: null,
        reconciledAt: null,
        createdAt: isoNow,
        updatedAt: isoNow,
        completedAt: null
      };
      this.memoryRecords.set(opId, newRecord);
      await this.persistToDisk();
      return { record: newRecord, action: "claimed" };
    }
    if (existing.ownerUid && existing.ownerUid !== ownerUid) {
      throw new SheetHubWorkerError(`Operation owner mismatch.`, 403, "OPERATION_OWNER_MISMATCH");
    }
    if (existing.sourceSpreadsheetId && existing.sourceSpreadsheetId !== sourceId) {
      throw new SheetHubWorkerError(`Operation source spreadsheet mismatch.`, 400, "OPERATION_SOURCE_MISMATCH");
    }
    if (existing.status === "COMPLETED" || existing.status === "NATIVE_SHEET_CREATED" || existing.status === "DRIVE_COPY_CREATED" || existing.status === "COPY_CONFIRMED" || existing.status === "FAILED_REQUIRES_RECONCILIATION" && existing.driveFileId) {
      return { record: existing, action: "reused" };
    }
    if (existing.status === "COPY_OUTCOME_UNKNOWN" || existing.status === "COPY_REQUESTED") {
      if (existing.status === "COPY_REQUESTED" && now >= existing.leaseExpiresAt) {
        existing.status = "COPY_OUTCOME_UNKNOWN";
        existing.leaseGeneration = (existing.leaseGeneration || 1) + 1;
        existing.updatedAt = isoNow;
        await this.persistToDisk();
      }
      return { record: existing, action: "requires_ambiguous_resolution" };
    }
    if (existing.status === "PROCESSING") {
      if (now < existing.leaseExpiresAt) {
        throw new SheetHubWorkerError(
          `Duplication operation "${opId}" is currently being processed by another worker instance. Concurrent requests are locked until lease expiry.`,
          409,
          "CONCURRENT_OPERATION_IN_PROGRESS"
        );
      }
      existing.status = "PROCESSING";
      existing.claimedAt = now;
      existing.leaseExpiresAt = now + leaseDuration;
      existing.leaseGeneration = (existing.leaseGeneration || 1) + 1;
      existing.attempts += 1;
      existing.updatedAt = isoNow;
      this.memoryRecords.set(opId, existing);
      await this.persistToDisk();
      return { record: existing, action: "reclaimed" };
    }
    existing.status = "PROCESSING";
    existing.claimedAt = now;
    existing.leaseExpiresAt = now + leaseDuration;
    existing.leaseGeneration = (existing.leaseGeneration || 1) + 1;
    existing.attempts += 1;
    existing.updatedAt = isoNow;
    this.memoryRecords.set(opId, existing);
    await this.persistToDisk();
    return { record: existing, action: "reclaimed" };
  }
  async updateOperationStage(input) {
    this.reloadFromDisk();
    const existing = this.memoryRecords.get(input.operationId);
    if (!existing) {
      throw new SheetHubWorkerError(`Operation "${input.operationId}" not found.`, 404, "OPERATION_NOT_FOUND");
    }
    if (input.leaseGeneration && existing.leaseGeneration !== input.leaseGeneration) {
      throw new SheetHubWorkerError(
        `Stale worker lease generation (${input.leaseGeneration} !== ${existing.leaseGeneration}).`,
        409,
        "STALE_LEASE_GENERATION"
      );
    }
    const iso = (/* @__PURE__ */ new Date()).toISOString();
    existing.status = input.status;
    if (input.driveFileId !== void 0) existing.driveFileId = input.driveFileId;
    if (input.driveUrl !== void 0) existing.driveUrl = input.driveUrl;
    if (input.nativeSheetId !== void 0) existing.nativeSheetId = input.nativeSheetId;
    if (input.lastErrorCode !== void 0) existing.lastErrorCode = input.lastErrorCode;
    if (input.errorMessage !== void 0) existing.errorMessage = input.errorMessage;
    existing.updatedAt = iso;
    this.memoryRecords.set(input.operationId, existing);
    await this.persistToDisk();
    return existing;
  }
  async recordCopyRequested(operationId, leaseGeneration) {
    return this.updateOperationStage({
      operationId,
      status: "COPY_REQUESTED",
      leaseGeneration
    });
  }
  async recordCopyConfirmed(input) {
    return this.updateOperationStage({
      operationId: input.operationId,
      status: "DRIVE_COPY_CREATED",
      leaseGeneration: input.leaseGeneration,
      driveFileId: input.driveFileId,
      driveUrl: input.driveUrl || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(input.driveFileId)}/edit`
    });
  }
  async recordCopyOutcomeUnknown(operationId, leaseGeneration, errorCode) {
    return this.updateOperationStage({
      operationId,
      status: "COPY_OUTCOME_UNKNOWN",
      leaseGeneration,
      lastErrorCode: errorCode || "NETWORK_OR_TIMEOUT_ERROR",
      errorMessage: "Drive duplicate request response was lost or timed out. Outcome is uncertain."
    });
  }
  async reconcileOperation(input) {
    this.reloadFromDisk();
    const existing = this.memoryRecords.get(input.operationId);
    if (!existing) {
      throw new SheetHubWorkerError(`Cannot reconcile: operation "${input.operationId}" not found.`, 404, "OPERATION_NOT_FOUND");
    }
    if (input.ownerUid && existing.ownerUid !== input.ownerUid) {
      throw new SheetHubWorkerError(`Cannot reconcile: owner mismatch.`, 403, "OPERATION_OWNER_MISMATCH");
    }
    const iso = (/* @__PURE__ */ new Date()).toISOString();
    existing.status = input.status;
    if (input.driveFileId) existing.driveFileId = input.driveFileId;
    if (input.nativeSheetId) existing.nativeSheetId = input.nativeSheetId;
    if (input.errorMessage) existing.errorMessage = input.errorMessage;
    existing.reconciledAt = iso;
    existing.updatedAt = iso;
    if (input.status === "COMPLETED" && !existing.completedAt) {
      existing.completedAt = iso;
    }
    this.memoryRecords.set(input.operationId, existing);
    await this.persistToDisk();
    return existing;
  }
  async getOperation(operationId) {
    this.reloadFromDisk();
    return this.memoryRecords.get(operationId) || null;
  }
  async recordFailed(opIdOrOptions, posErrorMessage) {
    const opId = typeof opIdOrOptions === "object" ? opIdOrOptions.operationId : opIdOrOptions;
    const errorMessage = typeof opIdOrOptions === "object" ? opIdOrOptions.errorMessage : posErrorMessage || "Unknown failure";
    return this.reconcileOperation({
      operationId: opId,
      status: "FAILED_REQUIRES_RECONCILIATION",
      errorMessage
    });
  }
  clearLedger() {
    this.memoryRecords.clear();
    if (this.ledgerFilePath && fs6.existsSync(this.ledgerFilePath)) {
      try {
        fs6.unlinkSync(this.ledgerFilePath);
      } catch {
      }
    }
  }
};
var DurableIdempotencyLedger = class {
  constructor(customStoragePathOrRepo) {
    if (customStoragePathOrRepo && typeof customStoragePathOrRepo === "object" && "claimOperation" in customStoragePathOrRepo) {
      if (isProductionEnvironment() && customStoragePathOrRepo.storageType === "file") {
        throw new SheetHubWorkerError(
          "Local file idempotency ledger injection is strictly forbidden in production. Production must use Firestore transactional persistence.",
          500,
          "PRODUCTION_STORAGE_VIOLATION"
        );
      }
      this.customRepository = customStoragePathOrRepo;
    } else if (customStoragePathOrRepo !== void 0) {
      if (isProductionEnvironment()) {
        throw new SheetHubWorkerError(
          "Local file path idempotency ledger is strictly forbidden in production. Production must use Firestore transactional persistence.",
          500,
          "PRODUCTION_STORAGE_VIOLATION"
        );
      }
      this.customRepository = new LocalFileLedgerRepository(customStoragePathOrRepo);
    }
  }
  get repository() {
    if (isProductionEnvironment()) {
      if (this.customRepository && this.customRepository.storageType === "file") {
        throw new SheetHubWorkerError(
          "Local file repository is strictly forbidden in production.",
          500,
          "PRODUCTION_STORAGE_VIOLATION"
        );
      }
      return this.customRepository || new FirestoreTransactionalLedgerRepository({
        projectId: PRODUCTION_PROJECT_ID
      });
    }
    if (this.customRepository) return this.customRepository;
    if (process.env.IDEMPOTENCY_STORAGE === "firestore") {
      return new FirestoreTransactionalLedgerRepository();
    }
    return new LocalFileLedgerRepository();
  }
  get storageType() {
    return this.repository.storageType;
  }
  async claimOperation(input) {
    return this.repository.claimOperation(input);
  }
  async updateOperationStage(input) {
    return this.repository.updateOperationStage(input);
  }
  async recordCopyRequested(operationId, leaseGeneration) {
    return this.repository.recordCopyRequested(operationId, leaseGeneration);
  }
  async recordCopyConfirmed(input) {
    return this.repository.recordCopyConfirmed(input);
  }
  async recordCopyOutcomeUnknown(operationId, leaseGeneration, errorCode) {
    return this.repository.recordCopyOutcomeUnknown(operationId, leaseGeneration, errorCode);
  }
  async reconcileOperation(input) {
    return this.repository.reconcileOperation(input);
  }
  async getOperation(operationId) {
    return this.repository.getOperation(operationId);
  }
  async recordDriveCopyCreated(opIdOrOptions, posDriveFileId, posDriveUrl) {
    const opId = typeof opIdOrOptions === "object" ? opIdOrOptions.operationId : opIdOrOptions;
    const driveFileId = typeof opIdOrOptions === "object" ? opIdOrOptions.driveFileId : posDriveFileId;
    const driveUrl = typeof opIdOrOptions === "object" ? opIdOrOptions.driveUrl : posDriveUrl;
    const op = await this.getOperation(opId);
    const leaseGen = op?.leaseGeneration || 1;
    return this.recordCopyConfirmed({
      operationId: opId,
      leaseGeneration: leaseGen,
      driveFileId,
      driveUrl
    });
  }
  async recordNativeSheetCreated(opIdOrOptions, posNativeSheetId) {
    const opId = typeof opIdOrOptions === "object" ? opIdOrOptions.operationId : opIdOrOptions;
    const nativeSheetId = typeof opIdOrOptions === "object" ? opIdOrOptions.nativeSheetId : posNativeSheetId;
    const op = await this.getOperation(opId);
    const leaseGen = op?.leaseGeneration || 1;
    return this.updateOperationStage({
      operationId: opId,
      status: "NATIVE_SHEET_CREATED",
      leaseGeneration: leaseGen,
      nativeSheetId
    });
  }
  async recordCompleted(opIdOrOptions, posDriveFileId, posNativeSheetId) {
    const opId = typeof opIdOrOptions === "object" ? opIdOrOptions.operationId : opIdOrOptions;
    const driveFileId = typeof opIdOrOptions === "object" ? opIdOrOptions.driveFileId : posDriveFileId;
    const nativeSheetId = typeof opIdOrOptions === "object" ? opIdOrOptions.nativeSheetId : posNativeSheetId;
    return this.reconcileOperation({
      operationId: opId,
      status: "COMPLETED",
      driveFileId,
      nativeSheetId
    });
  }
  async recordFailed(opIdOrOptions, posErrorMessage) {
    const opId = typeof opIdOrOptions === "object" ? opIdOrOptions.operationId : opIdOrOptions;
    const errorMessage = typeof opIdOrOptions === "object" ? opIdOrOptions.errorMessage : posErrorMessage || "Unknown failure";
    return this.reconcileOperation({
      operationId: opId,
      status: "FAILED_REQUIRES_RECONCILIATION",
      errorMessage
    });
  }
  clearLedger() {
    if (this.repository.clearLedger) {
      this.repository.clearLedger();
    }
  }
};
var defaultIdempotencyLedger = new DurableIdempotencyLedger();

// server/driveWorker.ts
var DRIVE_API_BASE = "https://www.googleapis.com/drive/v3/files";
var SHEETS_API_BASE4 = "https://sheets.googleapis.com/v4/spreadsheets";
async function searchDriveByOperationMarker(fetchImpl, token, operationId, sourceId, ownerUid, expectedRole = "dual_copy_duplicate") {
  const escapeDriveQ = (val) => val.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const searchUrl = `${DRIVE_API_BASE}?q=appProperties has { key='focusFlowOpId' and value='${escapeDriveQ(operationId)}' } and trashed = false&fields=files(id,name,webViewLink,createdTime,appProperties)`;
  try {
    const searchRes = await fetchImpl(searchUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!searchRes.ok) return { matches: [] };
    const searchData = await searchRes.json();
    const matches = (searchData.files || []).filter(
      (f) => f.id && f.id !== sourceId && f.appProperties?.focusFlowOpId === operationId && f.appProperties?.sourceSpreadsheetId === sourceId && (!ownerUid || f.appProperties?.ownerUid === ownerUid) && (!f.appProperties?.focusFlowRole || f.appProperties.focusFlowRole === expectedRole)
    );
    return { matches };
  } catch {
    return { matches: [] };
  }
}
var CACHE_TTL_MS = 10 * 60 * 1e3;
async function duplicateGoogleDriveFile(input, accessToken, fetchImpl = fetch, ledger = defaultIdempotencyLedger) {
  const token = (accessToken || "").trim();
  if (!token) {
    throw new SheetHubWorkerError(
      "Google Drive authorization is required to duplicate the spreadsheet.",
      401,
      "DRIVE_AUTH_REQUIRED"
    );
  }
  const sourceId = (input.sourceSpreadsheetId || "").trim();
  if (!isValidGoogleSpreadsheetId(sourceId)) {
    throw new SheetHubWorkerError(
      `Invalid source Google Spreadsheet ID "${sourceId}".`,
      400,
      "INVALID_SPREADSHEET_ID"
    );
  }
  const operationId = (input.operationId || input.idempotencyKey || `dual_copy_${sourceId}`).trim();
  const ownerUid = (input.ownerUid || "usr_anonymous").trim();
  const targetTitle = (input.title || "").trim() || `FocusFlow Copy \u2014 ${sourceId.slice(0, 8)}`;
  const claimResult = await ledger.claimOperation({
    operationId,
    ownerUid,
    sourceSpreadsheetId: sourceId,
    targetTitle,
    leaseTimeoutMs: 6e4
  });
  if ((claimResult.action === "reused" || claimResult.action === "reclaimed") && claimResult.record.driveFileId) {
    const existingFileId = claimResult.record.driveFileId;
    const existingUrl = claimResult.record.driveUrl || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(existingFileId)}/edit`;
    const result2 = {
      driveFileId: existingFileId,
      driveUrl: existingUrl,
      title: claimResult.record.targetTitle || targetTitle,
      sourceSpreadsheetId: sourceId,
      progressTrackerTabCreated: true,
      createdAt: claimResult.record.createdAt,
      operationId,
      status: claimResult.record.status,
      reusedExistingCopy: true
    };
    return result2;
  }
  if (claimResult.action === "requires_ambiguous_resolution") {
    const markerSearch = await searchDriveByOperationMarker(fetchImpl, token, operationId, sourceId, ownerUid);
    if (markerSearch.matches.length === 1) {
      const recovered = markerSearch.matches[0];
      const recoveredUrl = recovered.webViewLink || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(recovered.id)}/edit`;
      await ledger.recordCopyConfirmed({
        operationId,
        leaseGeneration: claimResult.record.leaseGeneration,
        driveFileId: recovered.id,
        driveUrl: recoveredUrl
      });
      let progressTrackerTabCreated2 = false;
      try {
        progressTrackerTabCreated2 = await ensureDriveProgressTrackerTab(
          recovered.id,
          token,
          input.topics,
          fetchImpl
        );
      } catch {
      }
      return {
        driveFileId: recovered.id,
        driveUrl: recoveredUrl,
        title: recovered.name || targetTitle,
        sourceSpreadsheetId: sourceId,
        progressTrackerTabCreated: progressTrackerTabCreated2,
        createdAt: recovered.createdTime || claimResult.record.createdAt,
        operationId,
        status: "DRIVE_COPY_CREATED",
        reusedExistingCopy: true
      };
    } else if (markerSearch.matches.length > 1) {
      await ledger.reconcileOperation({
        operationId,
        status: "FAILED_REQUIRES_RECONCILIATION",
        errorMessage: `Ambiguous Drive outcome: multiple (${markerSearch.matches.length}) duplicates found with marker "${operationId}".`
      });
      throw new SheetHubWorkerError(
        `Ambiguous Google Drive outcome: Multiple duplicate spreadsheets (${markerSearch.matches.length}) were found with operation marker "${operationId}". Duplication halted to prevent file proliferation. Please inspect your Google Drive.`,
        409,
        "MULTIPLE_DRIVE_DUPLICATES_FOUND"
      );
    } else {
      throw new SheetHubWorkerError(
        `Google Drive duplication outcome is uncertain for operation "${operationId}". A previous duplication was initiated but no duplicate file has been confirmed in Google Drive yet. Automatic copy is blocked to prevent duplicate files. Please wait a moment and retry.`,
        409,
        "COPY_OUTCOME_UNKNOWN"
      );
    }
  }
  const existingSearch = await searchDriveByOperationMarker(fetchImpl, token, operationId, sourceId, ownerUid);
  if (existingSearch.matches.length === 1) {
    const foundFile = existingSearch.matches[0];
    const foundDriveUrl = foundFile.webViewLink || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(foundFile.id)}/edit`;
    await ledger.recordCopyConfirmed({
      operationId,
      leaseGeneration: claimResult.record.leaseGeneration,
      driveFileId: foundFile.id,
      driveUrl: foundDriveUrl
    });
    let progressTrackerTabCreated2 = false;
    try {
      progressTrackerTabCreated2 = await ensureDriveProgressTrackerTab(
        foundFile.id,
        token,
        input.topics,
        fetchImpl
      );
    } catch {
    }
    return {
      driveFileId: foundFile.id,
      driveUrl: foundDriveUrl,
      title: foundFile.name || targetTitle,
      sourceSpreadsheetId: sourceId,
      progressTrackerTabCreated: progressTrackerTabCreated2,
      createdAt: foundFile.createdTime || claimResult.record.createdAt,
      operationId,
      status: "DRIVE_COPY_CREATED",
      reusedExistingCopy: true
    };
  } else if (existingSearch.matches.length > 1) {
    await ledger.reconcileOperation({
      operationId,
      status: "FAILED_REQUIRES_RECONCILIATION",
      errorMessage: `Multiple (${existingSearch.matches.length}) Drive duplicates found with marker "${operationId}".`
    });
    throw new SheetHubWorkerError(
      `Multiple duplicate files (${existingSearch.matches.length}) were found in Google Drive for operation "${operationId}". Halting to prevent further file proliferation.`,
      409,
      "MULTIPLE_DRIVE_DUPLICATES_FOUND"
    );
  }
  const metaUrl = `${DRIVE_API_BASE}/${encodeURIComponent(sourceId)}?fields=id,name,owners(displayName,emailAddress),capabilities(canCopy),trashed`;
  const metaRes = await fetchImpl(metaUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!metaRes.ok) {
    const errText = await metaRes.text().catch(() => "");
    let googleMessage = `HTTP ${metaRes.status} ${metaRes.statusText}`;
    let googleReason;
    try {
      const parsed = JSON.parse(errText);
      if (parsed?.error?.message) {
        googleMessage = parsed.error.message;
        googleReason = parsed.error.errors?.[0]?.reason || parsed.error.status;
      }
    } catch {
      if (errText) googleMessage = errText.slice(0, 300);
    }
    await ledger.recordFailed(operationId, googleMessage, false).catch(() => {
    });
    if (metaRes.status === 401) {
      throw new SheetHubWorkerError(
        `Google Drive authorization expired or invalid: ${googleMessage}. Please re-authenticate.`,
        401,
        "DRIVE_AUTH_REQUIRED",
        { status: 401, reason: googleReason, sourceSpreadsheetId: sourceId }
      );
    }
    if (metaRes.status === 404) {
      throw new SheetHubWorkerError(
        `Source spreadsheet "${sourceId}" was not found or is not accessible with current permissions (${googleMessage}). If this is a private spreadsheet in your Google Drive, please select it using "Browse My Google Drive" (Google Picker) so Google can grant per-file copy authorization under drive.file. For public sheets, ensure sharing is set to "Anyone with the link (Viewer)".`,
        404,
        "DRIVE_FILE_NOT_FOUND",
        { status: 404, reason: googleReason || "notFound", sourceSpreadsheetId: sourceId }
      );
    }
    if (metaRes.status === 403) {
      const reasonDetail = googleReason ? ` (Reason: ${googleReason})` : "";
      throw new SheetHubWorkerError(
        `Google Drive permission denied when copying "${sourceId}": ${googleMessage}${reasonDetail}. If this is a private spreadsheet, select it using "Browse My Google Drive" (Google Picker) to grant per-file authorization.`,
        403,
        "DRIVE_PERMISSION_DENIED",
        { status: 403, reason: googleReason, sourceSpreadsheetId: sourceId }
      );
    }
    throw new SheetHubWorkerError(
      `Failed to verify source spreadsheet in Google Drive (${metaRes.status}): ${googleMessage}`,
      metaRes.status >= 400 && metaRes.status < 500 ? metaRes.status : 502,
      "DRIVE_PREFLIGHT_FAILED",
      { status: metaRes.status, reason: googleReason, sourceSpreadsheetId: sourceId }
    );
  }
  const meta = await metaRes.json();
  if (meta.id && meta.id !== sourceId) {
    await ledger.recordFailed(operationId, "Drive metadata ID mismatch", false).catch(() => {
    });
    throw new SheetHubWorkerError(
      `Drive metadata returned unexpected file ID "${meta.id}" for requested source "${sourceId}".`,
      502,
      "DRIVE_ID_MISMATCH",
      { requestedId: sourceId, returnedId: meta.id }
    );
  }
  if (meta.trashed) {
    await ledger.recordFailed(operationId, "Source spreadsheet is in trash", false).catch(() => {
    });
    throw new SheetHubWorkerError(
      `Source spreadsheet "${sourceId}" is in Google Drive trash. Please restore it before duplicating.`,
      400,
      "DRIVE_FILE_TRASHED",
      { sourceSpreadsheetId: sourceId }
    );
  }
  if (meta.capabilities && meta.capabilities.canCopy === false) {
    await ledger.recordFailed(operationId, "Drive capabilities reports canCopy: false", false).catch(() => {
    });
    throw new SheetHubWorkerError(
      `You do not have copy permissions for source spreadsheet "${sourceId}" (Google Drive reports canCopy: false). The owner may have restricted downloading or copying.`,
      403,
      "DRIVE_CANNOT_COPY",
      { sourceSpreadsheetId: sourceId }
    );
  }
  const currentLeaseGen = claimResult.record.leaseGeneration;
  await ledger.recordCopyRequested(operationId, currentLeaseGen);
  const copyUrl = `${DRIVE_API_BASE}/${encodeURIComponent(sourceId)}/copy?fields=id,name,webViewLink,modifiedTime,appProperties`;
  let copyRes;
  try {
    copyRes = await fetchImpl(copyUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: targetTitle,
        description: "FocusFlow & Finance Dual-Copy Progress Tracker",
        appProperties: {
          focusFlowOpId: operationId,
          sourceSpreadsheetId: sourceId,
          ownerUid,
          focusFlowRole: "dual_copy_duplicate"
        }
      })
    });
  } catch (netErr) {
    await ledger.recordCopyOutcomeUnknown(operationId, currentLeaseGen, "NETWORK_OR_TIMEOUT_ERROR");
    const ambiguousCheck = await searchDriveByOperationMarker(fetchImpl, token, operationId, sourceId, ownerUid);
    if (ambiguousCheck.matches.length === 1) {
      const recovered = ambiguousCheck.matches[0];
      const recoveredUrl = recovered.webViewLink || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(recovered.id)}/edit`;
      await ledger.recordCopyConfirmed({
        operationId,
        leaseGeneration: currentLeaseGen,
        driveFileId: recovered.id,
        driveUrl: recoveredUrl
      });
      let progressTrackerTabCreated2 = false;
      try {
        progressTrackerTabCreated2 = await ensureDriveProgressTrackerTab(
          recovered.id,
          token,
          input.topics,
          fetchImpl
        );
      } catch {
      }
      return {
        driveFileId: recovered.id,
        driveUrl: recoveredUrl,
        title: recovered.name || targetTitle,
        sourceSpreadsheetId: sourceId,
        progressTrackerTabCreated: progressTrackerTabCreated2,
        createdAt: recovered.createdTime || claimResult.record.createdAt,
        operationId,
        status: "DRIVE_COPY_CREATED",
        reusedExistingCopy: true
      };
    } else if (ambiguousCheck.matches.length > 1) {
      await ledger.reconcileOperation({
        operationId,
        status: "FAILED_REQUIRES_RECONCILIATION",
        errorMessage: `Multiple (${ambiguousCheck.matches.length}) duplicates found following network error.`
      });
      throw new SheetHubWorkerError(
        `Ambiguous Google Drive outcome: Multiple duplicates (${ambiguousCheck.matches.length}) were found with operation ID "${operationId}". Duplication halted to prevent duplicate file proliferation.`,
        409,
        "MULTIPLE_DRIVE_DUPLICATES_FOUND"
      );
    } else {
      throw new SheetHubWorkerError(
        `Google Drive duplication request timed out or was interrupted, and no duplicate file could be confirmed yet (operation: "${operationId}"). An ambiguous outcome has been recorded. To avoid creating duplicate files, please retry in a few moments after Drive indexes the operation.`,
        504,
        "COPY_OUTCOME_UNKNOWN"
      );
    }
  }
  if (!copyRes.ok) {
    const errText = await copyRes.text().catch(() => "");
    let googleMessage = `HTTP ${copyRes.status} ${copyRes.statusText}`;
    let googleReason;
    try {
      const parsed = JSON.parse(errText);
      if (parsed?.error?.message) {
        googleMessage = parsed.error.message;
        googleReason = parsed.error.errors?.[0]?.reason || parsed.error.status;
      }
    } catch {
      if (errText) googleMessage = errText.slice(0, 300);
    }
    if (copyRes.status >= 500) {
      const ambiguousCheck = await searchDriveByOperationMarker(fetchImpl, token, operationId, sourceId, ownerUid);
      if (ambiguousCheck.matches.length === 1) {
        const recovered = ambiguousCheck.matches[0];
        const recoveredUrl = recovered.webViewLink || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(recovered.id)}/edit`;
        await ledger.recordCopyConfirmed({
          operationId,
          leaseGeneration: currentLeaseGen,
          driveFileId: recovered.id,
          driveUrl: recoveredUrl
        });
        return {
          driveFileId: recovered.id,
          driveUrl: recoveredUrl,
          title: recovered.name || targetTitle,
          sourceSpreadsheetId: sourceId,
          progressTrackerTabCreated: true,
          createdAt: recovered.createdTime || claimResult.record.createdAt,
          operationId,
          status: "DRIVE_COPY_CREATED",
          reusedExistingCopy: true
        };
      }
    }
    await ledger.recordFailed(operationId, googleMessage, false).catch(() => {
    });
    if (copyRes.status === 401) {
      throw new SheetHubWorkerError(
        `Google Drive authorization expired during copy: ${googleMessage}. Please re-authenticate.`,
        401,
        "DRIVE_AUTH_REQUIRED",
        { status: 401, reason: googleReason, sourceSpreadsheetId: sourceId }
      );
    }
    if (copyRes.status === 404) {
      throw new SheetHubWorkerError(
        `Source spreadsheet "${sourceId}" was not found or is not accessible with current permissions (${googleMessage}). If this is a private spreadsheet in your Google Drive, please select it using "Browse My Google Drive" (Google Picker) so Google can grant per-file copy authorization under drive.file. For public sheets, ensure sharing is set to "Anyone with the link (Viewer)".`,
        404,
        "DRIVE_FILE_NOT_FOUND",
        { status: 404, reason: googleReason, sourceSpreadsheetId: sourceId }
      );
    }
    if (copyRes.status === 403) {
      const reasonDetail = googleReason ? ` (Reason: ${googleReason})` : "";
      throw new SheetHubWorkerError(
        `Google Drive permission denied when copying "${sourceId}": ${googleMessage}${reasonDetail}. If this is a private spreadsheet, select it using "Browse My Google Drive" (Google Picker) to grant per-file authorization.`,
        403,
        "DRIVE_PERMISSION_DENIED",
        { status: 403, reason: googleReason, sourceSpreadsheetId: sourceId }
      );
    }
    throw new SheetHubWorkerError(
      `Failed to duplicate Google Spreadsheet (${copyRes.status}): ${googleMessage}`,
      502,
      "DRIVE_COPY_FAILED",
      { status: copyRes.status, reason: googleReason, sourceSpreadsheetId: sourceId }
    );
  }
  const copyData = await copyRes.json();
  const newDriveId = (copyData.id || "").trim();
  if (!newDriveId || newDriveId === sourceId) {
    await ledger.recordFailed(operationId, "Invalid copy ID returned", false).catch(() => {
    });
    throw new SheetHubWorkerError(
      `Google Drive copy returned invalid or identical file ID "${newDriveId}". Source file must remain isolated and untouched.`,
      502,
      "DRIVE_INVALID_COPY_ID",
      { sourceSpreadsheetId: sourceId, newDriveId }
    );
  }
  const newDriveUrl = copyData.webViewLink || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(newDriveId)}/edit`;
  await ledger.recordCopyConfirmed({
    operationId,
    leaseGeneration: currentLeaseGen,
    driveFileId: newDriveId,
    driveUrl: newDriveUrl
  });
  let progressTrackerTabCreated = false;
  try {
    progressTrackerTabCreated = await ensureDriveProgressTrackerTab(
      newDriveId,
      token,
      input.topics,
      fetchImpl
    );
  } catch (err) {
    console.warn(`[DriveWorker] Notice: Progress Tracker tab setup deferred for ${newDriveId}:`, err);
  }
  const result = {
    driveFileId: newDriveId,
    driveUrl: newDriveUrl,
    title: copyData.name || targetTitle,
    sourceSpreadsheetId: sourceId,
    progressTrackerTabCreated,
    createdAt: claimResult.record.createdAt,
    operationId,
    status: "DRIVE_COPY_CREATED"
  };
  return result;
}
async function ensureDriveProgressTrackerTab(spreadsheetId, accessToken, topics, fetchImpl = fetch) {
  const metaUrl = `${SHEETS_API_BASE4}/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(sheetId,title))`;
  const metaRes = await fetchImpl(metaUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!metaRes.ok) {
    return false;
  }
  const metaData = await metaRes.json();
  const existingSheets = metaData.sheets || [];
  const hasProgressTracker = existingSheets.some(
    (s) => s.properties?.title?.toLowerCase() === "progress tracker"
  );
  if (!hasProgressTracker) {
    const addSheetRes = await fetchImpl(
      `${SHEETS_API_BASE4}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: "Progress Tracker",
                  gridProperties: {
                    frozenRowCount: 1
                  }
                }
              }
            }
          ]
        })
      }
    );
    if (!addSheetRes.ok) {
      return false;
    }
  }
  const headerRow = ["Module / Unit", "Topic", "Subtopic", "Completed", "Last Synced"];
  const topicRows = (topics || []).map((t) => [
    t.unit || "",
    t.topic || "",
    t.subtopic || "",
    Boolean(t.isCompleted),
    (/* @__PURE__ */ new Date()).toISOString()
  ]);
  const allRows = [headerRow, ...topicRows];
  const updateUrl = `${SHEETS_API_BASE4}/${encodeURIComponent(spreadsheetId)}/values/'Progress Tracker'!A1:E${allRows.length}?valueInputOption=USER_ENTERED`;
  await fetchImpl(updateUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      range: `'Progress Tracker'!A1:E${allRows.length}`,
      majorDimension: "ROWS",
      values: allRows
    })
  });
  return true;
}

// server/appsScriptBridgeWorker.ts
import crypto4 from "node:crypto";
var AppsScriptBridgeError = class extends Error {
  constructor(message, status = 500, code = "APPS_SCRIPT_ERROR") {
    super(message);
    this.name = "AppsScriptBridgeError";
    this.status = status;
    this.code = code;
  }
};
function toCanonicalJson(data) {
  const keys = Object.keys(data).filter((k) => k !== "signature").sort();
  const sorted = {};
  for (const k of keys) {
    sorted[k] = data[k];
  }
  return JSON.stringify(sorted);
}
function computeAppsScriptHmac(canonicalString, secret) {
  return crypto4.createHmac("sha256", secret).update(canonicalString, "utf8").digest("hex");
}
var KNOWN_TEST_SPREADSHEETS = /* @__PURE__ */ new Set([
  "FocusFlow Writeback Test",
  "sem3-syllabus-sample",
  "test_sheet_123",
  "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
  // Public test fixture ID
]);
function isSpreadsheetAllowlisted(spreadsheetId, customAllowlist) {
  if (!spreadsheetId) return false;
  const trimmed = spreadsheetId.trim();
  if (KNOWN_TEST_SPREADSHEETS.has(trimmed)) return true;
  const envAllowlist = (process.env.APPS_SCRIPT_ALLOWLISTED_SPREADSHEETS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const combined = /* @__PURE__ */ new Set([...envAllowlist, ...customAllowlist || []]);
  return combined.has(trimmed);
}
async function dispatchAppsScriptWriteback(update, options = {}) {
  const spreadsheetId = (update.spreadsheetId || "").trim();
  const sheetTitle = (update.sheetTitle || "").trim();
  const rowNumber = Number(update.rowNumber);
  const colLetter = (update.colLetter || "").trim().toUpperCase();
  const value = update.value;
  if (!spreadsheetId) {
    throw new AppsScriptBridgeError("spreadsheetId is required.", 400, "INVALID_SPREADSHEET_ID");
  }
  if (!isSpreadsheetAllowlisted(spreadsheetId, options.allowedSpreadsheets)) {
    throw new AppsScriptBridgeError(
      `Spreadsheet "${spreadsheetId}" is not allowlisted for Apps Script write-back. Only the dedicated test spreadsheet is permitted.`,
      403,
      "SPREADSHEET_NOT_ALLOWLISTED"
    );
  }
  if (!sheetTitle) {
    throw new AppsScriptBridgeError("sheetTitle is required.", 400, "INVALID_SHEET_TITLE");
  }
  if (!Number.isInteger(rowNumber) || rowNumber < 1) {
    throw new AppsScriptBridgeError(`Invalid rowNumber: ${rowNumber}. Must be a positive integer.`, 400, "INVALID_ROW_NUMBER");
  }
  if (!/^[A-Z]{1,3}$/.test(colLetter)) {
    throw new AppsScriptBridgeError(`Invalid colLetter: ${colLetter}. Must be valid column letters (e.g. A-Z).`, 400, "INVALID_COL_LETTER");
  }
  const secret = options.secret || process.env.APPS_SCRIPT_WEBHOOK_SECRET;
  if (!secret) {
    throw new AppsScriptBridgeError(
      "APPS_SCRIPT_WEBHOOK_SECRET is not configured on the server. Please add it to your server environment configuration.",
      503,
      "APPS_SCRIPT_NOT_CONFIGURED"
    );
  }
  const webAppUrl = options.webAppUrl || process.env.APPS_SCRIPT_WEBAPP_URL;
  if (!webAppUrl) {
    throw new AppsScriptBridgeError(
      "APPS_SCRIPT_WEBAPP_URL is not configured on the server. Please deploy Code.gs and set APPS_SCRIPT_WEBAPP_URL.",
      503,
      "APPS_SCRIPT_NOT_CONFIGURED"
    );
  }
  const timestamp = Date.now();
  const nonce = crypto4.randomBytes(12).toString("hex");
  const payloadData = {
    action: "write_cell",
    colLetter,
    nonce,
    rowNumber,
    sheetTitle,
    spreadsheetId,
    timestamp,
    value
  };
  if (update.expectedIdentity) {
    payloadData.expectedIdentity = update.expectedIdentity;
  }
  const canonicalJson = toCanonicalJson(payloadData);
  const signature = computeAppsScriptHmac(canonicalJson, secret);
  const requestBody = JSON.stringify({
    ...payloadData,
    signature
  });
  const fetcher = options.fetchImpl || fetch;
  let response;
  try {
    response = await fetcher(webAppUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-FocusFlow-Signature": signature,
        "X-FocusFlow-Timestamp": String(timestamp)
      },
      body: requestBody,
      redirect: "follow"
    });
  } catch (netErr) {
    throw new AppsScriptBridgeError(
      `Network failure connecting to Apps Script Web App: ${netErr instanceof Error ? netErr.message : String(netErr)}`,
      502,
      "APPS_SCRIPT_NETWORK_ERROR"
    );
  }
  const responseText = await response.text();
  let result = null;
  try {
    result = JSON.parse(responseText);
  } catch {
    throw new AppsScriptBridgeError(
      `Apps Script Web App returned non-JSON response (${response.status}): ${responseText.slice(0, 300)}`,
      502,
      "APPS_SCRIPT_INVALID_RESPONSE"
    );
  }
  if (!response.ok || !result.success) {
    const errorMsg = result?.error || `Apps Script write failed with HTTP status ${response.status}`;
    const errorCode = result?.code || "APPS_SCRIPT_REJECTED";
    let effectiveStatus = 500;
    if (typeof result?.statusCode === "number" && result.statusCode >= 400 && result.statusCode < 600) {
      effectiveStatus = result.statusCode;
    } else if (response.status >= 400) {
      effectiveStatus = response.status;
    } else {
      switch (errorCode) {
        case "INVALID_SIGNATURE":
        case "MISSING_SIGNATURE":
          effectiveStatus = 401;
          break;
        case "NONCE_REPLAY":
          effectiveStatus = 403;
          break;
        case "SPREADSHEET_NOT_FOUND":
        case "SHEET_NOT_FOUND":
        case "ROW_NOT_FOUND":
          effectiveStatus = 404;
          break;
        case "DUPLICATE_ROW_IDENTITY":
          effectiveStatus = 409;
          break;
        case "INVALID_COORDINATES":
        case "UNSUPPORTED_ACTION":
        case "TIMESTAMP_OUT_OF_BOUNDS":
        case "MALFORMED_JSON":
        case "EMPTY_BODY":
          effectiveStatus = 400;
          break;
        case "SECRET_NOT_CONFIGURED":
          effectiveStatus = 503;
          break;
        default:
          effectiveStatus = 500;
          break;
      }
    }
    throw new AppsScriptBridgeError(errorMsg, effectiveStatus, errorCode);
  }
  return {
    success: true,
    updatedCell: result.updatedCell || `${sheetTitle}!${colLetter}${rowNumber}`,
    value: result.value !== void 0 ? result.value : value,
    updatedAt: result.updatedAt || (/* @__PURE__ */ new Date()).toISOString(),
    correctedRowNumber: result.correctedRowNumber,
    bridgeMode: "apps_script"
  };
}

// server/routes/googleCalendarOAuthCallback.ts
import { Router } from "express";

// server/integrations/googleCalendarService.ts
import crypto6 from "crypto";

// server/crypto.ts
import crypto5 from "crypto";
var ALGORITHM = "aes-256-gcm";
var IV_LENGTH = 12;
function resolveEncryptionKey() {
  const envKey = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  if (envKey && envKey.length > 0) {
    if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
      return Buffer.from(envKey, "hex");
    }
    return crypto5.createHash("sha256").update(envKey, "utf8").digest();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[CRITICAL_SECURITY_CONFIG] INTEGRATION_ENCRYPTION_KEY is not configured in production. Refusing to operate with unencrypted or fallback-keyed credentials."
    );
  }
  const fallbackSeed = "focusflow-development-integration-encryption-key-seed";
  return crypto5.createHash("sha256").update(fallbackSeed, "utf8").digest();
}
function encryptToken(plainText, customKey) {
  if (!plainText) {
    throw new Error("Cannot encrypt empty or null token");
  }
  const key = customKey || resolveEncryptionKey();
  const iv = crypto5.randomBytes(IV_LENGTH);
  const cipher = crypto5.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return {
    encrypted,
    iv: iv.toString("hex"),
    tag
  };
}
function decryptToken(payload, customKey) {
  if (!payload || !payload.encrypted || !payload.iv || !payload.tag) {
    throw new Error("Invalid encrypted payload: encrypted, iv, and tag are required");
  }
  const key = customKey || resolveEncryptionKey();
  const iv = Buffer.from(payload.iv, "hex");
  const tag = Buffer.from(payload.tag, "hex");
  const decipher = crypto5.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(payload.encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// src/lib/googleAuthGis.ts
var GHOST_OAUTH_CLIENT_ID = "1010159085609-hcetogi5vbajkg9706m6t9u9h11olfd7.apps.googleusercontent.com";

// server/integrations/googleCalendarService.ts
init_db();
var GoogleCalendarService = class {
  constructor(customFirestore) {
    this.customFirestore = null;
    if (customFirestore) {
      this.customFirestore = customFirestore;
    }
  }
  setFirestoreForTesting(db) {
    this.customFirestore = db;
  }
  get firestore() {
    return this.customFirestore || getAdminFirestore();
  }
  /**
   * Resolves OAuth 2.0 client configuration.
   */
  getOAuthCredentials() {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() || process.env.VITE_GOOGLE_CALENDAR_CLIENT_ID?.trim() || GHOST_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || "";
    const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
    const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() || `${appUrl}/api/integrations/google-calendar/oauth/callback`;
    return { clientId, clientSecret, redirectUri };
  }
  /**
   * Starts the OAuth authorization code flow.
   * Generates a single-use expiring state nonce securely bound to the user's UID.
   */
  async startOAuthFlow(userId, redirectUriOverride) {
    if (!userId || userId.startsWith("gst_")) {
      throw new Error("Authenticated user account required to initiate Calendar OAuth");
    }
    const { clientId, redirectUri: defaultRedirectUri } = this.getOAuthCredentials();
    const redirectUri = redirectUriOverride || defaultRedirectUri;
    const stateId = crypto6.randomBytes(32).toString("hex");
    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1e3;
    await this.firestore.collection("oauth_states").doc(stateId).set({
      stateId,
      userId,
      provider: "google_calendar",
      redirectUri,
      createdAt: now,
      expiresAt
    });
    const scope = "https://www.googleapis.com/auth/calendar.events";
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${encodeURIComponent(stateId)}`;
    return { authUrl, stateId };
  }
  /**
   * Handles the OAuth callback from Google.
   * Validates single-use state, exchanges authorization code, encrypts and stores tokens.
   */
  async handleOAuthCallback(code, stateId) {
    if (!code || !stateId) {
      throw new Error("Authorization code and state are required");
    }
    const stateRef = this.firestore.collection("oauth_states").doc(stateId);
    const stateDoc = await stateRef.get();
    if (!stateDoc.exists) {
      throw new Error("Invalid or already used OAuth state");
    }
    const stateData = stateDoc.data();
    await stateRef.delete();
    if (Date.now() > stateData.expiresAt) {
      throw new Error("Expired OAuth state nonce");
    }
    const { userId, redirectUri } = stateData;
    const { clientId, clientSecret } = this.getOAuthCredentials();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });
    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      throw new Error(`Google token exchange failed (${tokenResponse.status}): ${errText}`);
    }
    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      throw new Error("Missing access_token in Google token response");
    }
    const encAccessToken = encryptToken(tokenData.access_token);
    let encRefreshToken = tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : void 0;
    const integrationRef = this.firestore.collection("users").doc(userId).collection("integrations").doc("googleCalendar");
    if (!encRefreshToken) {
      const existingDoc = await integrationRef.get();
      if (existingDoc.exists) {
        const existingData = existingDoc.data();
        if (existingData?.encryptedRefreshToken) {
          encRefreshToken = {
            encrypted: existingData.encryptedRefreshToken,
            iv: existingData.refreshTokenIv,
            tag: existingData.refreshTokenTag
          };
        }
      }
    }
    const expiresAtMs = Date.now() + (tokenData.expires_in || 3600) * 1e3;
    await integrationRef.set(
      {
        connected: true,
        calendarId: "primary",
        encryptedAccessToken: encAccessToken.encrypted,
        accessTokenIv: encAccessToken.iv,
        accessTokenTag: encAccessToken.tag,
        ...encRefreshToken ? {
          encryptedRefreshToken: encRefreshToken.encrypted,
          refreshTokenIv: encRefreshToken.iv,
          refreshTokenTag: encRefreshToken.tag
        } : {},
        tokenExpiresAt: expiresAtMs,
        scopes: tokenData.scope ? tokenData.scope.split(" ") : ["https://www.googleapis.com/auth/calendar.events"],
        autoSyncTasks: true,
        autoSyncTimeBlocks: true,
        autoSyncStudySchedule: true,
        revoked: false,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      { merge: true }
    );
    return { success: true, userId };
  }
  /**
   * Retrieves connection status without leaking sensitive tokens.
   */
  async getConnectionStatus(userId) {
    if (!userId || userId.startsWith("gst_") || !hasServiceAccountCredentials() && !this.customFirestore) {
      return {
        connected: false,
        calendarId: "primary",
        autoSyncTasks: false,
        autoSyncTimeBlocks: false,
        autoSyncStudySchedule: false,
        lastSyncAt: null
      };
    }
    const doc = await this.firestore.collection("users").doc(userId).collection("integrations").doc("googleCalendar").get();
    if (!doc.exists) {
      return {
        connected: false,
        calendarId: "primary",
        autoSyncTasks: false,
        autoSyncTimeBlocks: false,
        autoSyncStudySchedule: false,
        lastSyncAt: null
      };
    }
    const data = doc.data() || {};
    return {
      connected: Boolean(data.connected) && !data.revoked,
      calendarId: data.calendarId || "primary",
      calendarName: data.calendarName || "Primary Calendar",
      autoSyncTasks: data.autoSyncTasks ?? true,
      autoSyncTimeBlocks: data.autoSyncTimeBlocks ?? true,
      autoSyncStudySchedule: data.autoSyncStudySchedule ?? true,
      lastSyncAt: data.lastSyncAt || null,
      revoked: Boolean(data.revoked)
    };
  }
  /**
   * Retrieves and automatically refreshes access token if expired.
   */
  async getValidAccessToken(userId) {
    const integrationRef = this.firestore.collection("users").doc(userId).collection("integrations").doc("googleCalendar");
    const doc = await integrationRef.get();
    if (!doc.exists) return null;
    const data = doc.data() || {};
    if (!data.connected || data.revoked) return null;
    const now = Date.now();
    const tokenExpiresAt = Number(data.tokenExpiresAt) || 0;
    if (tokenExpiresAt > now + 6e4 && data.encryptedAccessToken) {
      try {
        return decryptToken({
          encrypted: data.encryptedAccessToken,
          iv: data.accessTokenIv,
          tag: data.accessTokenTag
        });
      } catch (err) {
        console.warn("[GoogleCalendar] Token decryption failed, attempting refresh:", err);
      }
    }
    if (!data.encryptedRefreshToken) {
      console.warn("[GoogleCalendar] Access token expired and no refresh token available");
      return null;
    }
    let refreshToken;
    try {
      refreshToken = decryptToken({
        encrypted: data.encryptedRefreshToken,
        iv: data.refreshTokenIv,
        tag: data.refreshTokenTag
      });
    } catch (err) {
      console.error("[GoogleCalendar] Failed to decrypt refresh token:", err);
      return null;
    }
    const { clientId, clientSecret } = this.getOAuthCredentials();
    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    });
    if (!refreshRes.ok) {
      const errText = await refreshRes.text();
      console.warn(`[GoogleCalendar] Refresh token failed (${refreshRes.status}): ${errText}`);
      if (refreshRes.status === 400 || refreshRes.status === 401) {
        await integrationRef.update({
          connected: false,
          revoked: true,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      return null;
    }
    const freshData = await refreshRes.json();
    const encAccessToken = encryptToken(freshData.access_token);
    const newExpiresAt = Date.now() + (freshData.expires_in || 3600) * 1e3;
    await integrationRef.update({
      encryptedAccessToken: encAccessToken.encrypted,
      accessTokenIv: encAccessToken.iv,
      accessTokenTag: encAccessToken.tag,
      tokenExpiresAt: newExpiresAt,
      revoked: false,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return freshData.access_token;
  }
  /**
   * Disconnects Google Calendar and purges stored integration metadata.
   */
  async disconnect(userId) {
    const integrationRef = this.firestore.collection("users").doc(userId).collection("integrations").doc("googleCalendar");
    const doc = await integrationRef.get();
    if (doc.exists) {
      const data = doc.data() || {};
      if (data.encryptedAccessToken) {
        try {
          const token = decryptToken({
            encrypted: data.encryptedAccessToken,
            iv: data.accessTokenIv,
            tag: data.accessTokenTag
          });
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
          }).catch(() => void 0);
        } catch {
        }
      }
    }
    await integrationRef.delete();
    const linksSnap = await this.firestore.collection("users").doc(userId).collection("calendar_event_links").get();
    const batch = this.firestore.batch();
    linksSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  /**
   * Lists the user's Google Calendars.
   */
  async listCalendars(userId) {
    const accessToken = await this.getValidAccessToken(userId);
    if (!accessToken) {
      throw new Error("Google Calendar is not connected or authorization expired");
    }
    const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      console.warn(`[GoogleCalendar] CalendarList endpoint returned ${res.status} (least-privileged calendar.events scope). Falling back to primary calendar.`);
      return [{ id: "primary", summary: "Primary Calendar", primary: true }];
    }
    const data = await res.json();
    return (data.items || []).map((c) => ({
      id: c.id,
      summary: c.summary,
      primary: Boolean(c.primary),
      timeZone: c.timeZone
    }));
  }
  /**
   * Lists Google Calendar events within query range.
   * Distinguishes FocusFlow-managed events from read-only external events.
   */
  async listEvents(userId, params) {
    const accessToken = await this.getValidAccessToken(userId);
    if (!accessToken) {
      return [];
    }
    const calendarId = encodeURIComponent(params.calendarId || "primary");
    const query = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250"
    });
    if (params.timeMin) query.set("timeMin", params.timeMin);
    if (params.timeMax) query.set("timeMax", params.timeMax);
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${query.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      throw new Error(`Failed to list events (${res.status}): ${await res.text()}`);
    }
    const data = await res.json();
    const linksSnap = await this.firestore.collection("users").doc(userId).collection("calendar_event_links").get();
    const linkMap = /* @__PURE__ */ new Map();
    linksSnap.docs.forEach((d) => {
      const link = d.data();
      linkMap.set(link.googleEventId, link);
    });
    return (data.items || []).map((item) => {
      const link = linkMap.get(item.id);
      return {
        id: item.id,
        summary: item.summary || "(Untitled Event)",
        description: item.description,
        location: item.location,
        start: item.start || {},
        end: item.end || {},
        status: item.status,
        htmlLink: item.htmlLink,
        managePolicy: link ? "focusflow_managed" : "external_readonly",
        sourceType: link?.sourceType || "external",
        sourceId: link?.sourceId
      };
    });
  }
  /**
   * Creates an event on Google Calendar.
   */
  async createEvent(userId, eventData) {
    const accessToken = await this.getValidAccessToken(userId);
    if (!accessToken) {
      throw new Error("Google Calendar is not connected or authorization expired");
    }
    const calendarId = encodeURIComponent(eventData.calendarId || "primary");
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        summary: eventData.summary,
        description: eventData.description,
        start: eventData.start,
        end: eventData.end
      })
    });
    if (!res.ok) {
      throw new Error(`Failed to create calendar event (${res.status}): ${await res.text()}`);
    }
    const created = await res.json();
    return {
      id: created.id,
      summary: created.summary,
      description: created.description,
      start: created.start,
      end: created.end,
      status: created.status,
      htmlLink: created.htmlLink,
      managePolicy: "focusflow_managed"
    };
  }
  /**
   * Updates an existing event on Google Calendar.
   */
  async updateEvent(userId, eventId, eventData) {
    const accessToken = await this.getValidAccessToken(userId);
    if (!accessToken) {
      throw new Error("Google Calendar is not connected or authorization expired");
    }
    const calendarId = encodeURIComponent(eventData.calendarId || "primary");
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(eventData)
    });
    if (!res.ok) {
      throw new Error(`Failed to update calendar event (${res.status}): ${await res.text()}`);
    }
    const updated = await res.json();
    return {
      id: updated.id,
      summary: updated.summary,
      description: updated.description,
      start: updated.start,
      end: updated.end,
      status: updated.status,
      htmlLink: updated.htmlLink,
      managePolicy: "focusflow_managed"
    };
  }
  /**
   * Deletes an event on Google Calendar.
   * INVARIANT: Never deletes external events that were not created and mapped by FocusFlow!
   */
  async deleteEvent(userId, eventId, calendarId = "primary") {
    const linkQuery = await this.firestore.collection("users").doc(userId).collection("calendar_event_links").where("googleEventId", "==", eventId).limit(1).get();
    if (linkQuery.empty) {
      const err = new Error(
        "EXTERNAL_EVENT_PROTECTION: Cannot delete external Google Calendar events that were not created by FocusFlow."
      );
      err.code = "EXTERNAL_EVENT_PROTECTION";
      throw err;
    }
    const accessToken = await this.getValidAccessToken(userId);
    if (!accessToken) {
      throw new Error("Google Calendar is not connected or authorization expired");
    }
    const encodedCal = encodeURIComponent(calendarId);
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodedCal}/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(`Failed to delete calendar event (${res.status}): ${await res.text()}`);
    }
    const linkDoc = linkQuery.docs[0];
    await linkDoc.ref.delete();
  }
  /**
   * Synchronizes FocusFlow tasks and scheduled time blocks to Google Calendar.
   * Guarantees idempotency via checksum hashing and calendar_event_links mapping.
   */
  async syncTasks(userId, options) {
    const accessToken = await this.getValidAccessToken(userId);
    if (!accessToken) {
      throw new Error("Google Calendar is not connected or authorization expired");
    }
    const calendarId = options?.calendarId || "primary";
    let tasks = dbService.getRaw().tasks.filter((t) => t.userId === userId && !t.deletedAt);
    let timeBlocks = dbService.getTimeBlocks ? dbService.getTimeBlocks(userId).filter((b) => !b.deletedAt) : [];
    if (hasServiceAccountCredentials() || this.customFirestore) {
      try {
        const [tasksSnap, blocksSnap] = await Promise.all([
          this.firestore.collection("users").doc(userId).collection("tasks").get(),
          this.firestore.collection("users").doc(userId).collection("time_blocks").get()
        ]);
        tasks = tasksSnap.docs.map((d) => d.data()).filter((t) => !t.deletedAt);
        timeBlocks = blocksSnap.docs.map((d) => d.data()).filter((b) => !b.deletedAt);
      } catch (err) {
        console.warn(`[GoogleCalendar] Falling back to local tasks for user ${userId}:`, err);
      }
    }
    const linksRef = this.firestore.collection("users").doc(userId).collection("calendar_event_links");
    const existingLinksSnap = await linksRef.get();
    const linkMap = /* @__PURE__ */ new Map();
    existingLinksSnap.docs.forEach((d) => {
      const l = d.data();
      linkMap.set(l.sourceId, l);
    });
    let synced = 0;
    let updated = 0;
    let removed = 0;
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const title = `[Task] ${task.title}`;
      const description = `Priority: ${task.priority.toUpperCase()}
Status: ${task.status}
FocusFlow Task ID: ${task.id}`;
      const checksum = crypto6.createHash("sha256").update(`${title}|${task.dueDate}|${task.status}|${task.priority}`).digest("hex");
      const existingLink = linkMap.get(task.id);
      if (!existingLink) {
        try {
          const created = await this.createEvent(userId, {
            summary: title,
            description,
            start: { date: task.dueDate },
            end: { date: task.dueDate },
            calendarId
          });
          await linksRef.doc(task.id).set({
            sourceId: task.id,
            sourceType: "task",
            googleEventId: created.id,
            calendarId,
            lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString(),
            checksum,
            managePolicy: "focusflow_managed"
          });
          synced++;
        } catch (err) {
          console.warn(`[GoogleCalendarSync] Failed to create event for task ${task.id}:`, err);
        }
      } else if (existingLink.checksum !== checksum) {
        try {
          await this.updateEvent(userId, existingLink.googleEventId, {
            summary: title,
            description,
            start: { date: task.dueDate },
            end: { date: task.dueDate },
            calendarId
          });
          await linksRef.doc(task.id).update({
            checksum,
            lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString()
          });
          updated++;
        } catch (err) {
          console.warn(`[GoogleCalendarSync] Failed to update event for task ${task.id}:`, err);
        }
      }
    }
    const formatMinutesToIso = (dateStr, totalMinutes) => {
      const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.floor(totalMinutes)));
      const hh = String(Math.floor(clamped / 60)).padStart(2, "0");
      const mm = String(clamped % 60).padStart(2, "0");
      return `${dateStr}T${hh}:${mm}:00+05:30`;
    };
    for (const block of timeBlocks) {
      if (!block || !block.id || !block.date || typeof block.startMinute !== "number" || typeof block.endMinute !== "number" || block.endMinute <= block.startMinute) {
        continue;
      }
      const title = `[Focus Block] ${block.title || "Scheduled Block"}`;
      const description = `Category: ${block.category || "General"}
Status: ${block.completed ? "Completed" : "Planned"}
FocusFlow TimeBlock ID: ${block.id}`;
      const startIso = formatMinutesToIso(block.date, block.startMinute);
      const endIso = formatMinutesToIso(block.date, block.endMinute);
      const checksum = crypto6.createHash("sha256").update(`${title}|${startIso}|${endIso}|${block.completed ? "1" : "0"}|${block.category || ""}`).digest("hex");
      const linkKey = `tb_${block.id}`;
      const existingLink = linkMap.get(linkKey) || linkMap.get(block.id);
      if (!existingLink) {
        try {
          const created = await this.createEvent(userId, {
            summary: title,
            description,
            start: { dateTime: startIso, timeZone: "Asia/Kolkata" },
            end: { dateTime: endIso, timeZone: "Asia/Kolkata" },
            calendarId
          });
          await linksRef.doc(linkKey).set({
            sourceId: linkKey,
            sourceType: "timeblock",
            googleEventId: created.id,
            calendarId,
            lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString(),
            checksum,
            managePolicy: "focusflow_managed"
          });
          synced++;
        } catch (err) {
          console.warn(`[GoogleCalendarSync] Failed to create event for time block ${block.id}:`, err);
        }
      } else if (existingLink.checksum !== checksum) {
        try {
          await this.updateEvent(userId, existingLink.googleEventId, {
            summary: title,
            description,
            start: { dateTime: startIso, timeZone: "Asia/Kolkata" },
            end: { dateTime: endIso, timeZone: "Asia/Kolkata" },
            calendarId
          });
          await linksRef.doc(existingLink.sourceId).update({
            checksum,
            lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString()
          });
          updated++;
        } catch (err) {
          console.warn(`[GoogleCalendarSync] Failed to update event for time block ${block.id}:`, err);
        }
      }
    }
    for (const [sourceId, link] of linkMap.entries()) {
      if (link.sourceType === "task") {
        const stillActive = tasks.some((t) => t.id === sourceId);
        if (!stillActive) {
          try {
            await this.deleteEvent(userId, link.googleEventId, link.calendarId);
            removed++;
          } catch {
          }
        }
      } else if (link.sourceType === "timeblock") {
        const rawBlockId = sourceId.startsWith("tb_") ? sourceId.slice(3) : sourceId;
        const stillActive = timeBlocks.some((b) => b.id === rawBlockId);
        if (!stillActive) {
          try {
            await this.deleteEvent(userId, link.googleEventId, link.calendarId);
            removed++;
          } catch {
          }
        }
      }
    }
    await this.firestore.collection("users").doc(userId).collection("integrations").doc("googleCalendar").update({
      lastSyncAt: (/* @__PURE__ */ new Date()).toISOString()
    }).catch(() => void 0);
    return { synced, updated, removed };
  }
};
var googleCalendarService = new GoogleCalendarService();

// server/routes/googleCalendarOAuthCallback.ts
var googleCalendarOAuthCallbackRouter = Router();
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function serializeJsString(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}
googleCalendarOAuthCallbackRouter.get(
  "/integrations/google-calendar/oauth/callback",
  async (req, res) => {
    const code = req.query.code;
    const state = req.query.state;
    const error = req.query.error;
    if (error) {
      const escapedErr = String(error).replace(/[^a-zA-Z0-9_-]/g, "");
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Google Calendar Authorization Failed</title></head>
          <body style="font-family: system-ui, sans-serif; text-align: center; padding: 40px;">
            <h2>Authorization Denied</h2>
            <p>Google authorization error: ${escapeHtml(escapedErr)}</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_CALENDAR_AUTH_ERROR', error: ${serializeJsString(escapedErr)} }, window.location.origin);
                setTimeout(() => window.close(), 2000);
              }
            </script>
          </body>
        </html>
      `);
      return;
    }
    if (!code || !state) {
      res.status(400).json({
        error: "Missing code or state parameter in OAuth callback",
        code: "INVALID_CALLBACK_PARAMS"
      });
      return;
    }
    try {
      await googleCalendarService.handleOAuthCallback(code, state);
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Google Calendar Connected</title></head>
          <body style="font-family: system-ui, sans-serif; text-align: center; padding: 40px;">
            <h2 style="color: #16a34a;">Google Calendar Connected!</h2>
            <p>Your calendar integration is now active. This window will close automatically.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_CALENDAR_CONNECTED', success: true }, window.location.origin);
                setTimeout(() => window.close(), 1000);
              } else {
                window.location.href = '/?tab=settings&calendar=connected';
              }
            </script>
          </body>
        </html>
      `);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown callback error";
      console.error("[GoogleCalendarOAuth] Callback failed:", err);
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Google Calendar Connection Failed</title></head>
          <body style="font-family: system-ui, sans-serif; text-align: center; padding: 40px;">
            <h2 style="color: #dc2626;">Connection Failed</h2>
            <p>${escapeHtml(errMsg)}</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_CALENDAR_AUTH_ERROR', error: ${serializeJsString(errMsg)} }, window.location.origin);
                setTimeout(() => window.close(), 3000);
              }
            </script>
          </body>
        </html>
      `);
    }
  }
);

// server/routes/googleCalendarRoutes.ts
import { Router as Router2 } from "express";
var googleCalendarRouter = Router2();
function handleCalendarError(res, err, fallbackMessage) {
  const msg = err instanceof Error ? err.message : fallbackMessage;
  const isAuthError = msg.includes("authorization expired") || msg.includes("revoked") || msg.includes("not connected") || msg.includes("invalid_grant");
  const isExternalProtection = msg.includes("EXTERNAL_EVENT_PROTECTION");
  if (msg.includes("FIREBASE_ADMIN_UNAVAILABLE") || msg.includes("service account")) {
    res.status(503).json({
      error: msg,
      code: "SERVICE_UNAVAILABLE"
    });
    return;
  }
  if (isAuthError) {
    res.status(401).json({
      error: msg,
      code: "AUTH_EXPIRED"
    });
    return;
  }
  if (isExternalProtection) {
    res.status(403).json({
      error: msg,
      code: "EXTERNAL_EVENT_PROTECTION"
    });
    return;
  }
  res.status(500).json({
    error: msg,
    code: "CALENDAR_ERROR"
  });
}
function requireRealUser(req, res, next) {
  const authReq = req;
  if (!authReq.auth || authReq.auth.isGuest || authReq.auth.userId.startsWith("gst_")) {
    res.status(403).json({
      error: "Authenticated user account required. Guest sessions are not permitted.",
      code: "GUEST_ACCESS_DENIED"
    });
    return;
  }
  next();
}
function requireServiceAccount(req, res, next) {
  if (req.path === "/status" || req.path === "/status/" || req.path.endsWith("/status")) {
    return next();
  }
  if (!hasServiceAccountCredentials() && !googleCalendarService.customFirestore) {
    res.status(503).json({
      error: "Google Calendar integration requires configured Firebase Admin credentials.",
      code: "SERVICE_UNAVAILABLE"
    });
    return;
  }
  next();
}
googleCalendarRouter.use("/integrations/google-calendar", requireRealUser);
googleCalendarRouter.use("/integrations/google-calendar", requireServiceAccount);
googleCalendarRouter.get("/integrations/google-calendar/oauth/start", async (req, res) => {
  try {
    const authReq = req;
    const redirectUri = req.query.redirectUri;
    const { authUrl, stateId } = await googleCalendarService.startOAuthFlow(authReq.auth.userId, redirectUri);
    res.json({ authUrl, stateId });
  } catch (err) {
    handleCalendarError(res, err, "Failed to start OAuth flow");
  }
});
googleCalendarRouter.get("/integrations/google-calendar/status", async (req, res) => {
  try {
    const authReq = req;
    const status = await googleCalendarService.getConnectionStatus(authReq.auth.userId);
    res.json(status);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to get connection status";
    res.status(500).json({ error: msg });
  }
});
googleCalendarRouter.get("/integrations/google-calendar/calendars", async (req, res) => {
  try {
    const authReq = req;
    const calendars = await googleCalendarService.listCalendars(authReq.auth.userId);
    res.json({ calendars });
  } catch (err) {
    handleCalendarError(res, err, "Failed to list calendars");
  }
});
googleCalendarRouter.get("/integrations/google-calendar/events", async (req, res) => {
  try {
    const authReq = req;
    const timeMin = req.query.timeMin;
    const timeMax = req.query.timeMax;
    const calendarId = req.query.calendarId;
    const events = await googleCalendarService.listEvents(authReq.auth.userId, {
      timeMin,
      timeMax,
      calendarId
    });
    res.json({ events });
  } catch (err) {
    handleCalendarError(res, err, "Failed to list calendar events");
  }
});
googleCalendarRouter.post("/integrations/google-calendar/events", async (req, res) => {
  try {
    const authReq = req;
    const { summary, description, start, end, calendarId } = req.body;
    if (!summary || !start || !end) {
      res.status(400).json({ error: "summary, start, and end are required" });
      return;
    }
    const created = await googleCalendarService.createEvent(authReq.auth.userId, {
      summary,
      description,
      start,
      end,
      calendarId
    });
    res.status(201).json(created);
  } catch (err) {
    handleCalendarError(res, err, "Failed to create calendar event");
  }
});
googleCalendarRouter.patch("/integrations/google-calendar/events/:eventId", async (req, res) => {
  try {
    const authReq = req;
    const eventId = req.params.eventId;
    const calendarId = req.query.calendarId;
    const updated = await googleCalendarService.updateEvent(
      authReq.auth.userId,
      eventId,
      { ...req.body, calendarId }
    );
    res.json(updated);
  } catch (err) {
    handleCalendarError(res, err, "Failed to update calendar event");
  }
});
googleCalendarRouter.delete("/integrations/google-calendar/events/:eventId", async (req, res) => {
  try {
    const authReq = req;
    const eventId = req.params.eventId;
    const calendarId = req.query.calendarId || "primary";
    await googleCalendarService.deleteEvent(authReq.auth.userId, eventId, calendarId);
    res.json({ success: true });
  } catch (err) {
    handleCalendarError(res, err, "Failed to delete calendar event");
  }
});
googleCalendarRouter.post("/integrations/google-calendar/sync/tasks", async (req, res) => {
  try {
    const authReq = req;
    const calendarId = req.body?.calendarId;
    const result = await googleCalendarService.syncTasks(authReq.auth.userId, { calendarId });
    res.json({ success: true, ...result });
  } catch (err) {
    handleCalendarError(res, err, "Failed to sync tasks to calendar");
  }
});
googleCalendarRouter.delete("/integrations/google-calendar/connection", async (req, res) => {
  try {
    if (!hasServiceAccountCredentials()) {
      res.status(503).json({
        error: "Google Calendar integration requires configured Firebase Admin credentials.",
        code: "SERVICE_UNAVAILABLE"
      });
      return;
    }
    const authReq = req;
    await googleCalendarService.disconnect(authReq.auth.userId);
    res.json({ success: true, connected: false });
  } catch (err) {
    handleCalendarError(res, err, "Failed to disconnect calendar");
  }
});

// server/routes/pushRoutes.ts
import { Router as Router3 } from "express";

// server/integrations/pushNotificationService.ts
import crypto7 from "crypto";
init_db();
init_dateTime2();

// src/lib/notificationsEngine.ts
init_currency();
init_dateTime();

// src/lib/productivityIntelligence.ts
init_dateTime();

// src/lib/pomodoroAnalytics.ts
init_dateTime();

// src/lib/productivityIntelligence.ts
function isHabitScheduledOnDate(habit, dateStr) {
  if (habit.archived || habit.deletedAt) return false;
  if (habit.frequency === "daily") return true;
  const parsed = parseDateString(dateStr);
  if (!parsed) return true;
  const d = new Date(parsed.year, parsed.month - 1, parsed.day);
  const dayOfWeek = d.getDay();
  if (habit.frequency === "custom") {
    const allowed = habit.customDays && habit.customDays.length > 0 ? habit.customDays : [0, 1, 2, 3, 4, 5, 6];
    return allowed.includes(dayOfWeek);
  }
  return true;
}

// src/lib/notificationsEngine.ts
var DEFAULT_PREFS = {
  enabled: true,
  taskDeadlines: true,
  upcomingBills: true,
  billLeadDays: 3,
  overdueBills: true,
  focusCompletion: true,
  dailyFocusGoal: true,
  budgetWarnings: true,
  budgetWarningPercent: 80,
  syncFailures: true
};
function evaluateDeterministicNotifications(input) {
  const prefs = {
    ...DEFAULT_PREFS,
    ...input.settings?.notificationPrefs || {}
  };
  if (!prefs.enabled) return [];
  const items = [];
  const tz = input.settings?.timezone || DEFAULT_TIMEZONE;
  const currency = input.settings?.currency;
  const todayStr = getTodayDateString(tz);
  if (prefs.overdueBills) {
    const overdue = input.bills.filter((b) => !b.deletedAt && b.status === "OVERDUE");
    if (overdue.length > 0) {
      const total = overdue.reduce((acc, b) => acc + b.amountPaise, 0);
      items.push({
        id: `bills_overdue_${overdue.length}`,
        severity: "danger",
        category: "bill",
        title: `${overdue.length} Overdue Bill${overdue.length > 1 ? "s" : ""}`,
        message: `${formatCurrency(total, currency)} past due (${overdue[0].name}${overdue.length > 1 ? ` +${overdue.length - 1} more` : ""}).`,
        targetTab: "bills",
        actionLabel: "Pay Bills"
      });
    }
  }
  if (prefs.upcomingBills) {
    const horizonStr = addDays(todayStr, Math.max(1, prefs.billLeadDays || 3));
    const upcoming = input.bills.filter(
      (b) => !b.deletedAt && b.status === "UNPAID" && b.dueDate >= todayStr && b.dueDate <= horizonStr
    );
    if (upcoming.length > 0) {
      const total = upcoming.reduce((acc, b) => acc + b.amountPaise, 0);
      items.push({
        id: `bills_upcoming_${upcoming.length}`,
        severity: "warning",
        category: "bill",
        title: `${upcoming.length} Bill${upcoming.length > 1 ? "s" : ""} Due Soon`,
        message: `${formatCurrency(total, currency)} due within ${prefs.billLeadDays} days.`,
        targetTab: "bills",
        actionLabel: "Review Schedule"
      });
    }
  }
  if (prefs.taskDeadlines) {
    const dueOrOverdue = input.tasks.filter(
      (t) => !t.deletedAt && t.status !== "completed" && Boolean(t.dueDate) && t.dueDate <= todayStr
    );
    if (dueOrOverdue.length > 0) {
      const overdueCount = dueOrOverdue.filter((t) => t.dueDate < todayStr).length;
      items.push({
        id: `tasks_due_${dueOrOverdue.length}`,
        severity: overdueCount > 0 ? "warning" : "info",
        category: "task",
        title: overdueCount > 0 ? `${dueOrOverdue.length} Task${dueOrOverdue.length > 1 ? "s" : ""} Due / Overdue` : `${dueOrOverdue.length} Task${dueOrOverdue.length > 1 ? "s" : ""} Due Today`,
        message: `${dueOrOverdue[0].title}${dueOrOverdue.length > 1 ? ` and ${dueOrOverdue.length - 1} more` : ""}.`,
        targetTab: "tasks",
        actionLabel: "Open Tasks"
      });
    }
  }
  if (prefs.budgetWarnings && input.settings?.monthlyBudgetPaise && input.settings.monthlyBudgetPaise > 0 && input.dashboard) {
    const cap = input.settings.monthlyBudgetPaise;
    const spent = input.dashboard.monthlyExpensesPaise;
    const pct = Math.round(spent / cap * 100);
    const threshold = Math.max(50, Math.min(100, prefs.budgetWarningPercent || 80));
    if (pct >= 100) {
      items.push({
        id: `budget_exceeded_${pct}`,
        severity: "danger",
        category: "budget",
        title: "Monthly Budget Exceeded",
        message: `Spent ${formatCurrency(spent, currency)} of ${formatCurrency(cap, currency)} (${pct}%).`,
        targetTab: "finance",
        actionLabel: "Inspect Budgets"
      });
    } else if (pct >= threshold) {
      items.push({
        id: `budget_warn_${pct}`,
        severity: "warning",
        category: "budget",
        title: `Budget at ${pct}% Capacity`,
        message: `${formatCurrency(cap - spent, currency)} remaining in your monthly spending limit.`,
        targetTab: "finance",
        actionLabel: "View Budgets"
      });
    }
  }
  if (prefs.budgetWarnings && input.settings?.categoryBudgets && input.financeSummary) {
    for (const cat of input.financeSummary.categoryBreakdown) {
      const cap = cat.categoryId ? input.settings.categoryBudgets[cat.categoryId] : void 0;
      if (cap && cap > 0 && cat.amountPaise >= cap * (prefs.budgetWarningPercent || 80) / 100) {
        const pct = Math.round(cat.amountPaise / cap * 100);
        items.push({
          id: `cat_budget_${cat.categoryId || cat.name}`,
          severity: pct >= 100 ? "danger" : "warning",
          category: "budget",
          title: `${cat.name}: ${pct}% of Budget`,
          message: `${formatCurrency(cat.amountPaise, currency)} spent vs ${formatCurrency(cap, currency)} target.`,
          targetTab: "finance",
          actionLabel: "Manage Budgets"
        });
      }
    }
  }
  if (prefs.budgetWarnings && input.settings?.dailySpendingLimitPaise && input.settings.dailySpendingLimitPaise > 0 && input.dashboard?.todayExpensesPaise !== void 0) {
    const dailyLimit = input.settings.dailySpendingLimitPaise;
    const spentToday = input.dashboard.todayExpensesPaise;
    if (spentToday >= dailyLimit) {
      items.push({
        id: `daily_limit_reached_${todayStr}`,
        severity: "danger",
        category: "budget",
        title: "Daily Spending Limit Reached",
        message: `Spent ${formatCurrency(spentToday, currency)} today against your ${formatCurrency(dailyLimit, currency)} daily ceiling.`,
        targetTab: "finance",
        actionLabel: "Inspect Spending"
      });
    }
  }
  if (prefs.budgetWarnings && input.settings?.weeklySpendingLimitPaise && input.settings.weeklySpendingLimitPaise > 0 && input.expenses) {
    const weeklyLimit = input.settings.weeklySpendingLimitPaise;
    const sevenDaysAgoStr = addDays(todayStr, -6);
    const spentWeek = input.expenses.filter((e) => !e.deletedAt && e.date >= sevenDaysAgoStr && e.date <= todayStr).reduce((sum, e) => sum + e.amountPaise, 0);
    const pct = Math.round(spentWeek / weeklyLimit * 100);
    const threshold = Math.max(50, Math.min(100, prefs.budgetWarningPercent || 80));
    if (pct >= 100) {
      items.push({
        id: `weekly_limit_exceeded_${todayStr.slice(0, 7)}`,
        severity: "danger",
        category: "budget",
        title: "Weekly Budget Exceeded",
        message: `Spent ${formatCurrency(spentWeek, currency)} this week against your ${formatCurrency(weeklyLimit, currency)} budget (${pct}%).`,
        targetTab: "finance",
        actionLabel: "View Budgets"
      });
    } else if (pct >= threshold) {
      items.push({
        id: `weekly_limit_warning_${todayStr.slice(0, 7)}`,
        severity: "warning",
        category: "budget",
        title: `Weekly Budget at ${pct}%`,
        message: `${formatCurrency(weeklyLimit - spentWeek, currency)} remaining in this week's spending allowance.`,
        targetTab: "finance",
        actionLabel: "View Budgets"
      });
    }
  }
  if (input.savingsGoals) {
    for (const goal of input.savingsGoals) {
      if (goal.targetPaise > 0) {
        const pct = Math.round(goal.savedPaise / goal.targetPaise * 100);
        if (pct >= 100) {
          items.push({
            id: `goal_achieved_${goal.id}`,
            severity: "success",
            category: "budget",
            title: `Goal Achieved: ${goal.title}!`,
            message: `Congratulations! You've reached 100% of your ${formatCurrency(goal.targetPaise, currency)} target.`,
            targetTab: "finance",
            actionLabel: "View Goals"
          });
        }
      }
    }
  }
  if (input.expenses && input.expenses.length > 0) {
    const todayExpenses = input.expenses.filter((e) => !e.deletedAt && e.date === todayStr);
    for (const exp of todayExpenses) {
      if (exp.amountPaise >= 1e6) {
        items.push({
          id: `unusual_expense_${exp.id}`,
          severity: "info",
          category: "budget",
          title: "Large Expense Recorded",
          message: `${exp.description}: ${formatCurrency(exp.amountPaise, currency)} logged today.`,
          targetTab: "finance",
          actionLabel: "Inspect Ledger"
        });
      }
    }
  }
  if (prefs.dailyFocusGoal && input.dashboard && input.settings) {
    const goal = Math.max(15, input.settings.dailyFocusGoalMinutes || 100);
    if (input.dashboard.todayFocusMinutes >= goal) {
      items.push({
        id: `focus_goal_hit_${todayStr}`,
        severity: "success",
        category: "focus",
        title: "Daily Focus Goal Reached",
        message: `Completed ${input.dashboard.todayFocusMinutes} min against your ${goal} min target.`,
        targetTab: "focus",
        actionLabel: "View Stats"
      });
    }
  }
  if (input.habits && input.habits.length > 0) {
    const pendingHabits = input.habits.filter(
      (h) => !h.deletedAt && !h.archived && isHabitScheduledOnDate(h, todayStr) && !(h.completedDates || []).includes(todayStr)
    );
    if (pendingHabits.length > 0) {
      items.push({
        id: `habits_pending_${todayStr}`,
        severity: "info",
        category: "habit",
        title: `${pendingHabits.length} Habit${pendingHabits.length > 1 ? "s" : ""} Remaining Today`,
        message: `${pendingHabits[0].title}${pendingHabits.length > 1 ? ` and ${pendingHabits.length - 1} more` : ""} scheduled for today.`,
        targetTab: "habits",
        actionLabel: "Complete Habits"
      });
    }
  }
  const activeUncompletedTasks = input.tasks.filter((t) => !t.deletedAt && t.status !== "completed");
  const todayTasks = input.tasks.filter(
    (t) => !t.deletedAt && (t.dueDate === todayStr || t.completedAt && t.completedAt.slice(0, 10) === todayStr)
  );
  if (todayTasks.length === 0 && activeUncompletedTasks.length > 0) {
    items.push({
      id: `daily_plan_needed_${todayStr}`,
      severity: "info",
      category: "task",
      title: "Plan Your Day",
      message: "No tasks scheduled for today yet. Review and set your daily priority list.",
      targetTab: "tasks",
      actionLabel: "Plan Today"
    });
  }
  if (prefs.syncFailures && input.syncLastError) {
    items.push({
      id: "sheets_sync_error",
      severity: "warning",
      category: "sync",
      title: "Google Sheets Sync Deferred",
      message: input.syncLastError,
      targetTab: "settings",
      actionLabel: "Sync Settings"
    });
  }
  return items;
}

// server/integrations/pushNotificationService.ts
var PushNotificationService = class {
  constructor(customFirestore) {
    this.customFirestore = null;
    if (customFirestore) {
      this.customFirestore = customFirestore;
    }
  }
  setFirestoreForTesting(db) {
    this.customFirestore = db;
  }
  get firestore() {
    return this.customFirestore || getAdminFirestore();
  }
  /**
   * Registers a web push device token and installation identifier.
   */
  async registerDevice(userId, params) {
    if (!userId || userId.startsWith("gst_")) {
      throw new Error("Authenticated user required for device registration");
    }
    if (!params.token || typeof params.token !== "string") {
      throw new Error("Valid FCM registration token is required");
    }
    const installationId = params.installationId || crypto7.createHash("sha256").update(`${userId}:${params.token}`).digest("hex").slice(0, 32);
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const instRef = this.firestore.collection("users").doc(userId).collection("fcm_installations").doc(installationId);
    const existing = await instRef.get();
    const registeredAt = existing.exists ? existing.data()?.registeredAt || nowIso : nowIso;
    const installation = {
      installationId,
      token: params.token.trim(),
      userAgent: params.userAgent || "Web Browser",
      platform: params.platform || "web",
      enabled: true,
      registeredAt,
      lastSeenAt: nowIso
    };
    await instRef.set(installation, { merge: true });
    return installation;
  }
  /**
   * Unregisters a device installation.
   */
  async unregisterDevice(userId, installationIdOrToken) {
    if (!userId || userId.startsWith("gst_")) return false;
    if (!hasServiceAccountCredentials() && !this.customFirestore) {
      return false;
    }
    const colRef = this.firestore.collection("users").doc(userId).collection("fcm_installations");
    const docRef = colRef.doc(installationIdOrToken);
    const doc = await docRef.get();
    if (doc.exists) {
      await docRef.delete();
      return true;
    }
    const tokenQuery = await colRef.where("token", "==", installationIdOrToken).limit(1).get();
    if (!tokenQuery.empty) {
      await tokenQuery.docs[0].ref.delete();
      return true;
    }
    return false;
  }
  /**
   * Returns device registration status and connected devices count.
   */
  async getDeviceStatus(userId) {
    if (!userId || userId.startsWith("gst_") || !hasServiceAccountCredentials() && !this.customFirestore) {
      return { enabled: false, deviceCount: 0, devices: [] };
    }
    const snap = await this.firestore.collection("users").doc(userId).collection("fcm_installations").get();
    const devices = snap.docs.map((d) => {
      const data = d.data();
      return {
        installationId: data.installationId || d.id,
        platform: data.platform,
        userAgent: data.userAgent,
        lastSeenAt: data.lastSeenAt
      };
    });
    return {
      enabled: devices.length > 0,
      deviceCount: devices.length,
      devices
    };
  }
  /**
   * Sends multicast push notifications to all active user devices.
   * Cleans up stale or revoked device tokens automatically.
   */
  async sendNotification(userId, notification) {
    if (!userId || userId.startsWith("gst_")) {
      return { delivered: 0, failed: 0, skipped: true };
    }
    let settings = dbService.getUserSettings(userId);
    if (!settings && (hasServiceAccountCredentials() || this.customFirestore)) {
      try {
        const settingsDoc = await this.firestore.collection("users").doc(userId).collection("settings").doc("preferences").get();
        if (settingsDoc.exists) {
          settings = settingsDoc.data();
        }
      } catch {
      }
    }
    const prefs = settings?.notificationPrefs || {};
    if (prefs.enabled === false) {
      return { delivered: 0, failed: 0, skipped: true };
    }
    if (notification.category) {
      if (notification.category === "task" && prefs.taskDeadlines === false) return { delivered: 0, failed: 0, skipped: true };
      if (notification.category === "bill" && prefs.upcomingBills === false && prefs.overdueBills === false) return { delivered: 0, failed: 0, skipped: true };
      if (notification.category === "focus" && prefs.focusCompletion === false) return { delivered: 0, failed: 0, skipped: true };
      if (notification.category === "budget" && prefs.budgetWarnings === false) return { delivered: 0, failed: 0, skipped: true };
      if (notification.category === "sync" && prefs.syncFailures === false) return { delivered: 0, failed: 0, skipped: true };
      if (notification.category === "study" && prefs.studyReminders === false) return { delivered: 0, failed: 0, skipped: true };
    }
    const installationsSnap = await this.firestore.collection("users").doc(userId).collection("fcm_installations").where("enabled", "==", true).get();
    if (installationsSnap.empty) {
      return { delivered: 0, failed: 0 };
    }
    const tokens = [];
    const docMap = /* @__PURE__ */ new Map();
    installationsSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.token) {
        tokens.push(data.token);
        docMap.set(data.token, d.ref);
      }
    });
    if (tokens.length === 0) {
      return { delivered: 0, failed: 0 };
    }
    const messaging = getAdminMessaging();
    const targetTab = notification.targetTab || "dashboard";
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: notification.title,
        body: notification.body
      },
      data: {
        targetTab,
        category: notification.category || "general",
        tag: notification.tag || `focusflow_${Date.now()}`,
        ...notification.data || {}
      },
      webpush: {
        notification: {
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: notification.tag
        },
        fcmOptions: {
          link: `/?tab=${targetTab}`
        }
      }
    });
    let staleCount = 0;
    const cleanupBatch = this.firestore.batch();
    response.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error) {
        const code = resp.error.code;
        if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
          const badToken = tokens[idx];
          const ref = docMap.get(badToken);
          if (ref) {
            cleanupBatch.delete(ref);
            staleCount++;
          }
        }
      }
    });
    if (staleCount > 0) {
      await cleanupBatch.commit().catch((err) => {
        console.warn("[FCM] Stale device token cleanup batch error:", err);
      });
    }
    return {
      delivered: response.successCount,
      failed: response.failureCount
    };
  }
  /**
   * Sends an immediate test notification.
   */
  async sendTestNotification(userId) {
    return this.sendNotification(userId, {
      title: "FocusFlow Notification Test",
      body: "Push notifications are connected and working properly on your device!",
      category: "focus",
      targetTab: "settings",
      tag: "test_notification"
    });
  }
  /**
   * Processes and dispatches scheduled notifications across users.
   * Employs the notification_delivery_ledger for at-most-once idempotency.
   */
  async processScheduledNotifications() {
    const todayStr = getTodayDateString(DEFAULT_TIMEZONE);
    let dispatchedCount = 0;
    let processedUsers = 0;
    const rawDb = dbService.getRaw();
    const userIdsSet = /* @__PURE__ */ new Set();
    for (const u of rawDb.users || []) {
      if (u.id && !u.id.startsWith("gst_")) {
        userIdsSet.add(u.id);
      }
    }
    if (hasServiceAccountCredentials() || this.customFirestore) {
      try {
        const usersSnap = await this.firestore.collection("users").get();
        usersSnap.docs.forEach((d) => {
          if (d.id && !d.id.startsWith("gst_")) {
            userIdsSet.add(d.id);
          }
        });
      } catch (err) {
        console.warn("[FCM] Error discovering users in Firestore:", err);
      }
    }
    const userIds = Array.from(userIdsSet);
    for (const userId of userIds) {
      const deviceStatus = await this.getDeviceStatus(userId);
      if (!deviceStatus.enabled || deviceStatus.deviceCount === 0) continue;
      processedUsers++;
      let settings = dbService.getUserSettings(userId) || null;
      let tasks = rawDb.tasks.filter((t) => t.userId === userId && !t.deletedAt);
      let bills = rawDb.bills.filter((b) => b.userId === userId && !b.deletedAt);
      if (hasServiceAccountCredentials() || this.customFirestore) {
        try {
          const [tSnap, bSnap, sSnap] = await Promise.all([
            this.firestore.collection("users").doc(userId).collection("tasks").get(),
            this.firestore.collection("users").doc(userId).collection("bills").get(),
            this.firestore.collection("users").doc(userId).collection("settings").doc("preferences").get()
          ]);
          tasks = tSnap.docs.map((d) => d.data()).filter((t) => !t.deletedAt);
          bills = bSnap.docs.map((d) => d.data()).filter((b) => !b.deletedAt);
          if (sSnap.exists) {
            settings = sSnap.data();
          }
        } catch (err) {
          console.warn(`[FCM] Error loading Firestore records for ${userId}:`, err);
        }
      }
      const dashboard = null;
      const financeSummary = null;
      const items = evaluateDeterministicNotifications({
        settings: settings || null,
        tasks,
        bills,
        dashboard,
        financeSummary
      });
      for (const item of items) {
        const entryId = `${item.category}_${item.id}_${todayStr}`;
        const ledgerRef = this.firestore.collection("users").doc(userId).collection("notification_delivery_ledger").doc(entryId);
        const existing = await ledgerRef.get();
        if (existing.exists) {
          continue;
        }
        const res = await this.sendNotification(userId, {
          title: item.title,
          body: item.message,
          category: item.category,
          targetTab: item.targetTab,
          tag: entryId
        });
        if (res.delivered > 0) {
          dispatchedCount += res.delivered;
          await ledgerRef.set({
            entryId,
            category: item.category,
            title: item.title,
            body: item.message,
            targetTab: item.targetTab,
            deliveredAt: (/* @__PURE__ */ new Date()).toISOString(),
            status: "sent"
          });
        }
      }
    }
    return { processedUsers, dispatchedCount };
  }
};
var pushNotificationService = new PushNotificationService();

// server/routes/pushRoutes.ts
var pushRouter = Router3();
function requireRealUser2(req, res, next) {
  const authReq = req;
  if (!authReq.auth || authReq.auth.isGuest || authReq.auth.userId.startsWith("gst_")) {
    res.status(403).json({
      error: "Authenticated user account required. Guest sessions are not permitted.",
      code: "GUEST_ACCESS_DENIED"
    });
    return;
  }
  next();
}
pushRouter.use("/devices/fcm", requireRealUser2);
pushRouter.use("/notifications", requireRealUser2);
function requireServiceAccount2(req, res, next) {
  if (req.path === "/status" || req.path === "/status/") {
    return next();
  }
  if (!hasServiceAccountCredentials()) {
    res.status(503).json({
      error: "Push notification service requires configured Firebase Admin credentials.",
      code: "SERVICE_UNAVAILABLE"
    });
    return;
  }
  next();
}
pushRouter.use("/devices/fcm", requireServiceAccount2);
pushRouter.use("/notifications", requireServiceAccount2);
pushRouter.post("/devices/fcm/register", async (req, res) => {
  try {
    const authReq = req;
    const { token, installationId, platform } = req.body;
    if (!token) {
      res.status(400).json({ error: "token is required" });
      return;
    }
    const installation = await pushNotificationService.registerDevice(authReq.auth.userId, {
      token,
      installationId,
      platform,
      userAgent: req.headers["user-agent"]
    });
    res.status(200).json({ success: true, installation });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to register device";
    res.status(500).json({ error: msg });
  }
});
pushRouter.post("/devices/fcm/unregister", async (req, res) => {
  try {
    const authReq = req;
    const { installationId, token } = req.body;
    const target = installationId || token;
    if (!target) {
      res.status(400).json({ error: "installationId or token is required" });
      return;
    }
    const success = await pushNotificationService.unregisterDevice(authReq.auth.userId, target);
    res.json({ success });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to unregister device";
    res.status(500).json({ error: msg });
  }
});
pushRouter.get("/devices/fcm/status", async (req, res) => {
  try {
    const authReq = req;
    const status = await pushNotificationService.getDeviceStatus(authReq.auth.userId);
    res.json(status);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to get device status";
    res.status(500).json({ error: msg });
  }
});
pushRouter.post("/notifications/test", async (req, res) => {
  try {
    const authReq = req;
    const result = await pushNotificationService.sendTestNotification(authReq.auth.userId);
    res.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send test notification";
    res.status(500).json({ error: msg });
  }
});

// server/routes/cronNotificationRoutes.ts
import { Router as Router4 } from "express";
var cronNotificationRouter = Router4();
function verifyCronSecret(req, res) {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret && process.env.NODE_ENV === "test") {
    return true;
  }
  if (!expectedSecret) {
    res.status(500).json({ error: "CRON_SECRET is not configured on the server" });
    return false;
  }
  const authHeader = req.headers.authorization;
  const cronHeader = req.headers["x-cron-secret"];
  const bearerMatch = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() === expectedSecret : false;
  const headerMatch = cronHeader === expectedSecret;
  if (!bearerMatch && !headerMatch) {
    res.status(401).json({ error: "Unauthorized: Invalid or missing CRON_SECRET" });
    return false;
  }
  return true;
}
var handleCron = async (req, res) => {
  if (!verifyCronSecret(req, res)) return;
  try {
    const result = await pushNotificationService.processScheduledNotifications();
    res.status(200).json({
      success: true,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      ...result
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Cron notification dispatch failed";
    console.error("[CronNotification] Execution failed:", err);
    res.status(500).json({ error: msg });
  }
};
cronNotificationRouter.get("/cron/notifications", handleCron);
cronNotificationRouter.post("/cron/notifications", handleCron);

// server/routes.ts
var apiRouter = Router5();
apiRouter.use(googleCalendarOAuthCallbackRouter);
apiRouter.use(cronNotificationRouter);
apiRouter.use(requireUserContext);
apiRouter.use(rateLimiter({ maxRequests: 300, windowMs: 6e4 }));
apiRouter.use(googleCalendarRouter);
apiRouter.use(pushRouter);
var getAuth = (req) => req.auth;
var canAccess = (itemUserId, authUserId) => itemUserId === authUserId;
apiRouter.get("/auth/me", (req, res) => {
  const auth = getAuth(req);
  const { user, settings } = dbService.ensureUserWorkspace(auth.userId, auth);
  res.json({ user, settings });
});
apiRouter.put("/settings", async (req, res, next) => {
  const auth = getAuth(req);
  const { settings } = dbService.ensureUserWorkspace(auth.userId, auth);
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const {
    currency,
    pomodoroWorkDuration,
    shortBreakDuration,
    longBreakDuration,
    autoSwitchSessions,
    soundEnabled,
    theme,
    themeConfig,
    savedThemes,
    activeSavedThemeId,
    googleSpreadsheetId,
    lastSyncedAt,
    dailyFocusGoalMinutes,
    weeklyFocusGoalMinutes,
    monthlyBudgetPaise,
    categoryBudgets,
    dashboardLayout,
    notificationPrefs,
    favoriteStyleIds,
    favoriteThemeIds,
    keyboardShortcutsEnabled
  } = body;
  if (currency !== void 0) {
    const parsedCurrency = parseEnum(currency, ALLOWED_CURRENCIES);
    if (!parsedCurrency) {
      res.status(400).json({ error: "Invalid currency code" });
      return;
    }
    settings.currency = parsedCurrency;
  }
  if (pomodoroWorkDuration !== void 0) {
    const parsedWork = parsePositiveInt(pomodoroWorkDuration, 1, 180);
    if (parsedWork === null) {
      res.status(400).json({ error: "pomodoroWorkDuration must be a whole number between 1 and 180" });
      return;
    }
    settings.pomodoroWorkDuration = parsedWork;
  }
  if (shortBreakDuration !== void 0) {
    const parsedShort = parsePositiveInt(shortBreakDuration, 1, 60);
    if (parsedShort === null) {
      res.status(400).json({ error: "shortBreakDuration must be a whole number between 1 and 60" });
      return;
    }
    settings.shortBreakDuration = parsedShort;
  }
  if (longBreakDuration !== void 0) {
    const parsedLong = parsePositiveInt(longBreakDuration, 1, 120);
    if (parsedLong === null) {
      res.status(400).json({ error: "longBreakDuration must be a whole number between 1 and 120" });
      return;
    }
    settings.longBreakDuration = parsedLong;
  }
  if (autoSwitchSessions !== void 0) {
    if (typeof autoSwitchSessions !== "boolean") {
      res.status(400).json({ error: "autoSwitchSessions must be a boolean" });
      return;
    }
    settings.autoSwitchSessions = autoSwitchSessions;
  }
  if (soundEnabled !== void 0) {
    if (typeof soundEnabled !== "boolean") {
      res.status(400).json({ error: "soundEnabled must be a boolean" });
      return;
    }
    settings.soundEnabled = soundEnabled;
  }
  if (theme !== void 0) {
    const parsedTheme = parseEnum(theme, ALLOWED_THEMES);
    if (!parsedTheme) {
      res.status(400).json({ error: "Invalid theme mode" });
      return;
    }
    settings.theme = parsedTheme;
  }
  if (themeConfig !== void 0) {
    if (typeof themeConfig !== "object" || themeConfig === null || Array.isArray(themeConfig)) {
      res.status(400).json({ error: "Invalid themeConfig object" });
      return;
    }
    settings.themeConfig = themeConfig;
  }
  if (savedThemes !== void 0) {
    if (!Array.isArray(savedThemes)) {
      res.status(400).json({ error: "savedThemes must be an array" });
      return;
    }
    settings.savedThemes = savedThemes;
  }
  if (activeSavedThemeId !== void 0) {
    if (activeSavedThemeId !== null && typeof activeSavedThemeId !== "string") {
      res.status(400).json({ error: "Invalid activeSavedThemeId" });
      return;
    }
    settings.activeSavedThemeId = activeSavedThemeId;
  }
  if (googleSpreadsheetId !== void 0) {
    if (googleSpreadsheetId !== null && typeof googleSpreadsheetId !== "string") {
      res.status(400).json({ error: "Invalid googleSpreadsheetId" });
      return;
    }
    settings.googleSpreadsheetId = googleSpreadsheetId ?? void 0;
  }
  if (lastSyncedAt !== void 0) {
    if (lastSyncedAt !== null && typeof lastSyncedAt !== "string") {
      res.status(400).json({ error: "Invalid lastSyncedAt" });
      return;
    }
    settings.lastSyncedAt = lastSyncedAt ?? void 0;
  }
  if (dailyFocusGoalMinutes !== void 0) {
    const parsedGoal = parsePositiveInt(dailyFocusGoalMinutes, 5, 720);
    if (parsedGoal === null) {
      res.status(400).json({ error: "dailyFocusGoalMinutes must be between 5 and 720" });
      return;
    }
    settings.dailyFocusGoalMinutes = parsedGoal;
  }
  if (weeklyFocusGoalMinutes !== void 0) {
    const parsedWeekly = parsePositiveInt(weeklyFocusGoalMinutes, 30, 5040);
    if (parsedWeekly === null) {
      res.status(400).json({ error: "weeklyFocusGoalMinutes must be between 30 and 5040" });
      return;
    }
    settings.weeklyFocusGoalMinutes = parsedWeekly;
  }
  if (monthlyBudgetPaise !== void 0) {
    const parsedBudget = parseNonNegativeInt(monthlyBudgetPaise, 1e9);
    if (parsedBudget === null) {
      res.status(400).json({ error: "monthlyBudgetPaise must be a non-negative integer" });
      return;
    }
    settings.monthlyBudgetPaise = parsedBudget;
  }
  if (categoryBudgets !== void 0) {
    if (typeof categoryBudgets !== "object" || categoryBudgets === null || Array.isArray(categoryBudgets)) {
      res.status(400).json({ error: "categoryBudgets must be a key-value map" });
      return;
    }
    const cleanMap = {};
    for (const [k, v] of Object.entries(categoryBudgets)) {
      const parsedVal = parseNonNegativeInt(v, 1e9);
      if (parsedVal === null) {
        res.status(400).json({ error: `Invalid budget value for category ${k}` });
        return;
      }
      cleanMap[k] = parsedVal;
    }
    settings.categoryBudgets = cleanMap;
  }
  if (dashboardLayout !== void 0) {
    if (typeof dashboardLayout !== "object" || dashboardLayout === null || Array.isArray(dashboardLayout)) {
      res.status(400).json({ error: "Invalid dashboardLayout object" });
      return;
    }
    settings.dashboardLayout = dashboardLayout;
  }
  if (notificationPrefs !== void 0) {
    if (typeof notificationPrefs !== "object" || notificationPrefs === null || Array.isArray(notificationPrefs)) {
      res.status(400).json({ error: "Invalid notificationPrefs object" });
      return;
    }
    settings.notificationPrefs = notificationPrefs;
  }
  if (favoriteStyleIds !== void 0) {
    if (!Array.isArray(favoriteStyleIds) || !favoriteStyleIds.every((x) => typeof x === "string")) {
      res.status(400).json({ error: "favoriteStyleIds must be an array of strings" });
      return;
    }
    settings.favoriteStyleIds = favoriteStyleIds;
  }
  if (favoriteThemeIds !== void 0) {
    if (!Array.isArray(favoriteThemeIds) || !favoriteThemeIds.every((x) => typeof x === "string")) {
      res.status(400).json({ error: "favoriteThemeIds must be an array of strings" });
      return;
    }
    settings.favoriteThemeIds = favoriteThemeIds;
  }
  if (keyboardShortcutsEnabled !== void 0) {
    if (typeof keyboardShortcutsEnabled !== "boolean") {
      res.status(400).json({ error: "keyboardShortcutsEnabled must be a boolean" });
      return;
    }
    settings.keyboardShortcutsEnabled = keyboardShortcutsEnabled;
  }
  try {
    await dbService.save();
    res.json({ success: true, settings });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.post("/reseed", async (req, res, next) => {
  const { userId } = getAuth(req);
  try {
    dbService.reseed(userId);
    await dbService.flush();
    res.json({ success: true, message: "Workspace reset to starter seed data" });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/dashboard", (req, res) => {
  const auth = getAuth(req);
  const userId = auth.userId;
  dbService.ensureUserWorkspace(userId, auth);
  dbService.checkRecurringBills(userId);
  const db = dbService.getRaw();
  const userSettings = db.userSettings.find((s) => s.userId === userId);
  const tz = userSettings?.timezone || DEFAULT_TIMEZONE;
  const todayStr = getTodayDateString(tz);
  const currentMonthKey = todayStr.substring(0, 7);
  const weekStartStr = getStartOfWeek(todayStr);
  const userSessions = db.focusSessions.filter((s) => s.userId === userId);
  const todaySessions = userSessions.filter((s) => formatDateInTimezone(s.startedAt, tz) === todayStr && s.completed);
  const weekSessions = userSessions.filter(
    (s) => s.completed && s.mode === "work" && s.startedAt.slice(0, 10) >= weekStartStr
  );
  const getSessionDurationSecs = (s) => typeof s.actualDurationSeconds === "number" && !Number.isNaN(s.actualDurationSeconds) ? s.actualDurationSeconds : typeof s.durationSeconds === "number" && !Number.isNaN(s.durationSeconds) ? s.durationSeconds : (s.durationMinutes || 0) * 60;
  const todayFocusSeconds = todaySessions.filter((s) => s.mode === "work").reduce((acc, s) => acc + getSessionDurationSecs(s), 0);
  const weeklyFocusMinutes = Math.round(
    weekSessions.reduce((acc, s) => acc + getSessionDurationSecs(s), 0) / 60
  );
  const completedPomodoroSessions = todaySessions.filter((s) => s.mode === "work").length;
  const streak = calculateBoundedStreakDays(userSessions, tz);
  const bestStreakDays = computeBestStreakDays2(userSessions, tz);
  const activeTasks = db.tasks.filter((t) => t.userId === userId && !t.deletedAt);
  const completedTasksCount = activeTasks.filter((t) => t.status === "completed").length;
  const pendingTasksCount = activeTasks.filter((t) => t.status !== "completed").length;
  const activeIncomes = db.incomeTransactions.filter(
    (inc) => inc.userId === userId && !inc.deletedAt
  );
  const currentIncomes = activeIncomes.filter((inc) => inc.date.startsWith(currentMonthKey));
  const monthlyIncomePaise = currentIncomes.reduce((acc, inc) => acc + inc.amountPaise, 0);
  const todayIncomePaise = activeIncomes.filter((inc) => inc.date === todayStr).reduce((acc, inc) => acc + inc.amountPaise, 0);
  const activeExpenses = db.expenseTransactions.filter(
    (exp) => exp.userId === userId && !exp.deletedAt
  );
  const currentExpenses = activeExpenses.filter((exp) => exp.date.startsWith(currentMonthKey));
  const monthlyExpensesPaise = currentExpenses.reduce((acc, exp) => acc + exp.amountPaise, 0);
  const todayExpensesPaise = activeExpenses.filter((exp) => exp.date === todayStr).reduce((acc, exp) => acc + exp.amountPaise, 0);
  const fixedExpensesPaise = currentExpenses.filter((e) => e.type === "fixed").reduce((acc, e) => acc + e.amountPaise, 0);
  const variableExpensesPaise = currentExpenses.filter((e) => e.type === "variable").reduce((acc, e) => acc + e.amountPaise, 0);
  const remainingBalancePaise = monthlyIncomePaise - monthlyExpensesPaise;
  const activeBills = db.bills.filter((b) => b.userId === userId && !b.deletedAt);
  const currentBills = activeBills.filter(
    (b) => b.periodKey === currentMonthKey || b.status === "OVERDUE"
  );
  const paidBillsCount = currentBills.filter((b) => b.status === "PAID").length;
  const unpaidBillsCount = currentBills.filter(
    (b) => b.status === "UNPAID" || b.status === "OVERDUE"
  ).length;
  const totalPaidAmountPaise = currentBills.filter((b) => b.status === "PAID").reduce((acc, b) => acc + b.amountPaise, 0);
  const totalUnpaidAmountPaise = currentBills.filter((b) => b.status === "UNPAID" || b.status === "OVERDUE").reduce((acc, b) => acc + b.amountPaise, 0);
  const upcomingPayments = activeBills.filter((b) => b.status === "UNPAID" || b.status === "OVERDUE").sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5);
  const recentIncome = currentIncomes.map((inc) => ({
    id: inc.id,
    type: "income",
    name: inc.source,
    category: inc.category,
    amountPaise: inc.amountPaise,
    date: inc.date,
    notes: inc.notes
  }));
  const recentExpense = currentExpenses.map((exp) => ({
    id: exp.id,
    type: exp.type,
    name: exp.description,
    category: db.categories.find(
      (c) => c.id === exp.categoryId && (c.userId === userId || c.userId === "usr_atif_default")
    )?.name || (exp.type === "fixed" ? "Fixed Expense" : "Uncategorized"),
    amountPaise: exp.amountPaise,
    date: exp.date,
    notes: exp.notes,
    paymentMethod: exp.paymentMethod
  }));
  const recentTransactions = [...recentIncome, ...recentExpense].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  res.json({
    todayFocusMinutes: Math.round(todayFocusSeconds / 60),
    weeklyFocusMinutes,
    completedPomodoroSessions,
    focusStreakDays: streak,
    bestStreakDays,
    completedTasksCount,
    pendingTasksCount,
    todayIncomePaise,
    todayExpensesPaise,
    monthlyIncomePaise,
    monthlyExpensesPaise,
    fixedExpensesPaise,
    variableExpensesPaise,
    remainingBalancePaise,
    paidBillsCount,
    unpaidBillsCount,
    totalPaidAmountPaise,
    totalUnpaidAmountPaise,
    upcomingPayments,
    recentTransactions
  });
});
apiRouter.get("/focus/sessions", (req, res) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const sessions = db.focusSessions.filter((s) => s.userId === userId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  res.json(sessions);
});
apiRouter.post("/focus/sessions", async (req, res, _next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const {
    id,
    taskId,
    subjectCode,
    subjectId,
    topicId,
    activityType,
    mode,
    presetId,
    durationMinutes,
    durationSeconds,
    actualDurationSeconds,
    completed,
    status,
    interrupted,
    pauseCount,
    totalPauseSeconds,
    interruptionReason,
    startedAt,
    endedAt,
    endReason
  } = body;
  const parsedMode = mode === void 0 ? "work" : parseEnum(mode, ALLOWED_FOCUS_MODES);
  if (!parsedMode) {
    res.status(400).json({ error: "Invalid focus session mode" });
    return;
  }
  const parsedMinutes = durationMinutes === void 0 ? 25 : parsePositiveInt(durationMinutes, 1, 180);
  if (parsedMinutes === null) {
    res.status(400).json({ error: "durationMinutes must be a positive integer between 1 and 180" });
    return;
  }
  const parsedSeconds = durationSeconds === void 0 ? parsedMinutes * 60 : parsePositiveInt(durationSeconds, 1, 10800);
  if (parsedSeconds === null) {
    res.status(400).json({ error: "durationSeconds must be a positive integer between 1 and 10800" });
    return;
  }
  if (completed !== void 0 && typeof completed !== "boolean") {
    res.status(400).json({ error: "completed must be a boolean" });
    return;
  }
  if (taskId !== void 0 && taskId !== null && typeof taskId !== "string") {
    res.status(400).json({ error: "Invalid taskId" });
    return;
  }
  const parsedStatus = status === void 0 ? void 0 : parseEnum(status, ["in_progress", "completed", "interrupted"]);
  if (status !== void 0 && !parsedStatus) {
    res.status(400).json({ error: "Invalid session status" });
    return;
  }
  const parsedEndReason = endReason === void 0 || endReason === null ? null : parseEnum(endReason, ["completed", "reset", "skipped", "abandoned"]);
  if (endReason !== void 0 && endReason !== null && !parsedEndReason) {
    res.status(400).json({ error: "Invalid endReason" });
    return;
  }
  const isCompleted = completed !== void 0 ? completed : parsedStatus !== void 0 ? parsedStatus === "completed" : true;
  const resolvedStatus = parsedStatus || (isCompleted ? "completed" : "in_progress");
  const parsedActualDurationSeconds = actualDurationSeconds === void 0 ? isCompleted ? parsedSeconds : 0 : parseNonNegativeInt(actualDurationSeconds, 86400);
  if (parsedActualDurationSeconds === null) {
    res.status(400).json({ error: "actualDurationSeconds must be a non-negative integer between 0 and 86400" });
    return;
  }
  const parsedPauseCount = pauseCount === void 0 ? 0 : parseNonNegativeInt(pauseCount, 1e3);
  if (parsedPauseCount === null) {
    res.status(400).json({ error: "pauseCount must be a non-negative integer" });
    return;
  }
  const parsedTotalPauseSeconds = totalPauseSeconds === void 0 ? 0 : parseNonNegativeInt(totalPauseSeconds, 86400);
  if (parsedTotalPauseSeconds === null) {
    res.status(400).json({ error: "totalPauseSeconds must be a non-negative integer" });
    return;
  }
  const startIso = typeof startedAt === "string" && !Number.isNaN(Date.parse(startedAt)) ? startedAt : (/* @__PURE__ */ new Date()).toISOString();
  const endIso = endedAt === null ? null : typeof endedAt === "string" && !Number.isNaN(Date.parse(endedAt)) ? endedAt : isCompleted ? (/* @__PURE__ */ new Date()).toISOString() : null;
  const clientProvidedId = typeof id === "string" && id.trim().length > 0 && id.trim().length <= 128 ? id.trim() : null;
  const resolvedSessionId = clientProvidedId || `foc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const existing = clientProvidedId ? db.focusSessions.find((s) => s.id === resolvedSessionId && s.userId === userId) : void 0;
  const wasCompleted = Boolean(existing?.completed);
  let taskTitle = existing?.taskTitle;
  const resolvedTaskId = typeof taskId === "string" && taskId.trim() ? taskId.trim() : null;
  if (resolvedTaskId) {
    const task = db.tasks.find((t) => t.id === resolvedTaskId && t.userId === userId && !t.deletedAt);
    if (task) {
      taskTitle = task.title;
      if (!wasCompleted && isCompleted && parsedMode === "work") {
        task.completedPomodoros = (task.completedPomodoros || 0) + 1;
        task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      }
    }
  }
  const resolvedSubjectCode = typeof subjectCode === "string" && subjectCode.trim() ? subjectCode.trim() : null;
  const resolvedSubjectId = typeof subjectId === "string" && subjectId.trim() ? subjectId.trim() : null;
  const resolvedTopicId = typeof topicId === "string" && topicId.trim() ? topicId.trim() : null;
  const resolvedPresetId = typeof presetId === "string" && presetId.trim() ? presetId.trim() : null;
  const resolvedActivityType = typeof activityType === "string" && ["study", "practice", "theory", "revision"].includes(activityType) ? activityType : null;
  const sessionPayload = {
    id: resolvedSessionId,
    userId,
    taskId: resolvedTaskId,
    taskTitle: taskTitle ?? null,
    subjectCode: resolvedSubjectCode,
    subjectId: resolvedSubjectId,
    topicId: resolvedTopicId,
    activityType: resolvedActivityType,
    mode: parsedMode,
    presetId: resolvedPresetId,
    durationMinutes: parsedMinutes,
    durationSeconds: parsedSeconds,
    actualDurationSeconds: parsedActualDurationSeconds,
    completed: isCompleted,
    status: resolvedStatus,
    interrupted: typeof interrupted === "boolean" ? interrupted : resolvedStatus === "interrupted",
    pauseCount: parsedPauseCount,
    totalPauseSeconds: parsedTotalPauseSeconds,
    interruptionReason: typeof interruptionReason === "string" ? interruptionReason.trim() : void 0,
    startedAt: existing?.startedAt || startIso,
    endedAt: endIso,
    endReason: parsedEndReason ?? (isCompleted ? "completed" : null)
  };
  if (existing) {
    Object.assign(existing, sessionPayload);
  } else {
    db.focusSessions.push(sessionPayload);
  }
  try {
    await dbService.save();
    res.status(existing ? 200 : 201).json(existing || sessionPayload);
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.patch("/focus/sessions/:id", async (req, res) => {
  const { userId } = getAuth(req);
  const { id } = req.params;
  const db = dbService.getRaw();
  const session = db.focusSessions.find((s) => s.id === id && s.userId === userId);
  if (!session) {
    res.status(404).json({ error: "Focus session not found" });
    return;
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const wasCompleted = Boolean(session.completed);
  if (body.status !== void 0) {
    const parsedStatus = parseEnum(body.status, ["in_progress", "completed", "interrupted"]);
    if (!parsedStatus) {
      res.status(400).json({ error: "Invalid session status" });
      return;
    }
    session.status = parsedStatus;
    if (body.completed === void 0) {
      session.completed = parsedStatus === "completed";
    }
  }
  if (body.completed !== void 0) {
    if (typeof body.completed !== "boolean") {
      res.status(400).json({ error: "completed must be a boolean" });
      return;
    }
    session.completed = body.completed;
    if (body.status === void 0) {
      session.status = body.completed ? "completed" : "interrupted";
    }
  }
  if (body.actualDurationSeconds !== void 0) {
    const parsedActual = parseNonNegativeInt(body.actualDurationSeconds, 86400);
    if (parsedActual === null) {
      res.status(400).json({ error: "actualDurationSeconds must be a non-negative integer between 0 and 86400" });
      return;
    }
    session.actualDurationSeconds = parsedActual;
  }
  if (body.endedAt !== void 0) {
    if (body.endedAt === null) {
      session.endedAt = null;
    } else if (typeof body.endedAt === "string" && !Number.isNaN(Date.parse(body.endedAt))) {
      session.endedAt = body.endedAt;
    } else {
      res.status(400).json({ error: "Invalid endedAt timestamp" });
      return;
    }
  }
  if (body.endReason !== void 0) {
    if (body.endReason === null) {
      session.endReason = null;
    } else {
      const parsedEndReason = parseEnum(body.endReason, ["completed", "reset", "skipped", "abandoned"]);
      if (!parsedEndReason) {
        res.status(400).json({ error: "Invalid endReason" });
        return;
      }
      session.endReason = parsedEndReason;
    }
  }
  if (body.interrupted !== void 0) {
    session.interrupted = Boolean(body.interrupted);
  }
  if (body.pauseCount !== void 0) {
    const parsedPauseCount = parseNonNegativeInt(body.pauseCount, 1e3);
    if (parsedPauseCount === null) {
      res.status(400).json({ error: "pauseCount must be a non-negative integer" });
      return;
    }
    session.pauseCount = parsedPauseCount;
  }
  if (body.totalPauseSeconds !== void 0) {
    const parsedTotalPause = parseNonNegativeInt(body.totalPauseSeconds, 86400);
    if (parsedTotalPause === null) {
      res.status(400).json({ error: "totalPauseSeconds must be a non-negative integer" });
      return;
    }
    session.totalPauseSeconds = parsedTotalPause;
  }
  if (typeof body.interruptionReason === "string") {
    session.interruptionReason = body.interruptionReason.trim();
  }
  if (!wasCompleted && session.completed && session.mode === "work" && session.taskId) {
    const task = db.tasks.find((t) => t.id === session.taskId && t.userId === userId && !t.deletedAt);
    if (task) {
      task.completedPomodoros = (task.completedPomodoros || 0) + 1;
      task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
  }
  try {
    await dbService.save();
    res.json(session);
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/focus/stats", (req, res) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const userSettings = db.userSettings.find((s) => s.userId === userId);
  const tz = userSettings?.timezone || DEFAULT_TIMEZONE;
  const todayStr = getTodayDateString(tz);
  const workSessions = db.focusSessions.filter(
    (s) => s.userId === userId && s.completed && s.mode === "work"
  );
  const getSessionDurationSecs = (s) => typeof s.actualDurationSeconds === "number" ? s.actualDurationSeconds : s.durationSeconds;
  const last7Days = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 6; i >= 0; i--) {
    const d = /* @__PURE__ */ new Date(`${todayStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const dayName = dayNames[d.getUTCDay()];
    const daysSessions = workSessions.filter((s) => formatDateInTimezone(s.startedAt, tz) === dateStr);
    const totalSecs = daysSessions.reduce((acc, s) => acc + getSessionDurationSecs(s), 0);
    last7Days.push({
      date: dateStr,
      dayName,
      minutes: Math.round(totalSecs / 60),
      sessionsCount: daysSessions.length
    });
  }
  const dailyHeatmap = [];
  for (let i = 83; i >= 0; i--) {
    const d = /* @__PURE__ */ new Date(`${todayStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const daySessions = workSessions.filter((s) => formatDateInTimezone(s.startedAt, tz) === dateStr);
    const totalSecs = daySessions.reduce((acc, s) => acc + getSessionDurationSecs(s), 0);
    dailyHeatmap.push({
      date: dateStr,
      minutes: Math.round(totalSecs / 60),
      sessionsCount: daySessions.length
    });
  }
  const weeklyMinutes = last7Days.reduce((acc, d) => acc + d.minutes, 0);
  const currentMonthKey = todayStr.substring(0, 7);
  const monthSessions = workSessions.filter(
    (s) => formatDateInTimezone(s.startedAt, tz).startsWith(currentMonthKey)
  );
  const monthMinutes = Math.round(
    monthSessions.reduce((acc, s) => acc + getSessionDurationSecs(s), 0) / 60
  );
  const totalMinutes = Math.round(
    workSessions.reduce((acc, s) => acc + getSessionDurationSecs(s), 0) / 60
  );
  const totalCompletedSessions = workSessions.length;
  res.json({
    last7Days,
    dailyHeatmap,
    weeklyMinutes,
    monthMinutes,
    monthSessionsCount: monthSessions.length,
    totalMinutes,
    totalCompletedSessions
  });
});
apiRouter.get("/tasks", (req, res) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const tasks = db.tasks.filter((t) => t.userId === userId && !t.deletedAt).sort((a, b) => {
    if (typeof a.order === "number" && typeof b.order === "number" && a.order !== b.order) {
      return a.order - b.order;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
  res.json(tasks);
});
apiRouter.post("/tasks", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const {
    title,
    description,
    priority,
    status,
    estimatedPomodoros,
    dueDate,
    category,
    subtasks,
    recurrence,
    order,
    subjectId,
    subjectCode,
    topicId,
    unit,
    subtopicTitle
  } = body;
  const parsedTitle = parseNonEmptyString(title, 200);
  if (!parsedTitle) {
    res.status(400).json({ error: "Title is required and must be a non-empty string" });
    return;
  }
  const parsedDesc = parseOptionalString(description, 2e3);
  if (parsedDesc === null) {
    res.status(400).json({ error: "Description must be a string" });
    return;
  }
  const parsedPriority = priority === void 0 ? "medium" : parseEnum(priority, ALLOWED_TASK_PRIORITIES);
  if (!parsedPriority) {
    res.status(400).json({ error: "Invalid task priority" });
    return;
  }
  const parsedStatus = status === void 0 ? "todo" : parseEnum(status, ALLOWED_TASK_STATUSES);
  if (!parsedStatus) {
    res.status(400).json({ error: "Invalid task status" });
    return;
  }
  const parsedRecurrence = recurrence === void 0 ? "none" : parseEnum(recurrence, ALLOWED_TASK_RECURRENCES);
  if (!parsedRecurrence) {
    res.status(400).json({ error: "Invalid task recurrence" });
    return;
  }
  const parsedEst = estimatedPomodoros === void 0 ? 1 : parsePositiveInt(estimatedPomodoros, 1, 100);
  if (parsedEst === null) {
    res.status(400).json({ error: "estimatedPomodoros must be a positive integer between 1 and 100" });
    return;
  }
  let parsedDueDate = null;
  if (dueDate !== void 0 && dueDate !== null && dueDate !== "") {
    parsedDueDate = parseIsoDate(dueDate);
    if (!parsedDueDate) {
      res.status(400).json({ error: "dueDate must be a valid YYYY-MM-DD date" });
      return;
    }
  }
  const parsedCategory = category === void 0 || category === "" ? "General" : parseNonEmptyString(category, 60);
  if (!parsedCategory) {
    res.status(400).json({ error: "Invalid category" });
    return;
  }
  const parsedSubtasks = subtasks === void 0 ? [] : parseSubtasks(subtasks);
  if (parsedSubtasks === null) {
    res.status(400).json({ error: "Invalid subtasks array" });
    return;
  }
  const parsedOrder = order === void 0 ? 0 : parseNonNegativeInt(order, 1e5);
  if (parsedOrder === null) {
    res.status(400).json({ error: "Invalid task order index" });
    return;
  }
  const parsedSubjectId = parseOptionalString(subjectId, 128);
  const parsedSubjectCode = parseOptionalString(subjectCode, 128);
  const parsedTopicId = parseOptionalString(topicId, 128);
  const parsedUnit = parseOptionalString(unit, 128);
  const parsedSubtopicTitle = parseOptionalString(subtopicTitle, 200);
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const newTask = {
    id: `tsk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    title: parsedTitle,
    description: parsedDesc,
    priority: parsedPriority,
    status: parsedStatus,
    category: parsedCategory,
    subtasks: parsedSubtasks,
    recurrence: parsedRecurrence,
    order: parsedOrder,
    estimatedPomodoros: parsedEst,
    completedPomodoros: 0,
    dueDate: parsedDueDate,
    completedAt: parsedStatus === "completed" ? nowIso : null,
    deletedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    subjectId: parsedSubjectId || null,
    subjectCode: parsedSubjectCode || null,
    topicId: parsedTopicId || null,
    unit: parsedUnit || null,
    subtopicTitle: parsedSubtopicTitle || null
  };
  db.tasks.unshift(newTask);
  try {
    await dbService.save();
    res.status(201).json(newTask);
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.put("/tasks/:id", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const task = db.tasks.find((t) => t.id === req.params.id && t.userId === userId && !t.deletedAt);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const {
    title,
    description,
    priority,
    status,
    category,
    subtasks,
    recurrence,
    order,
    estimatedPomodoros,
    completedPomodoros,
    dueDate,
    subjectId,
    subjectCode,
    topicId,
    unit,
    subtopicTitle
  } = body;
  const previousStatus = task.status;
  if (title !== void 0) {
    const parsedTitle = parseNonEmptyString(title, 200);
    if (!parsedTitle) {
      res.status(400).json({ error: "Title must be a non-empty string" });
      return;
    }
    task.title = parsedTitle;
  }
  if (description !== void 0) {
    const parsedDesc = parseOptionalString(description, 2e3);
    if (parsedDesc === null) {
      res.status(400).json({ error: "Description must be a string" });
      return;
    }
    task.description = parsedDesc;
  }
  if (priority !== void 0) {
    const parsedPriority = parseEnum(priority, ALLOWED_TASK_PRIORITIES);
    if (!parsedPriority) {
      res.status(400).json({ error: "Invalid task priority" });
      return;
    }
    task.priority = parsedPriority;
  }
  if (status !== void 0) {
    const parsedStatus = parseEnum(status, ALLOWED_TASK_STATUSES);
    if (!parsedStatus) {
      res.status(400).json({ error: "Invalid task status" });
      return;
    }
    task.status = parsedStatus;
    task.completedAt = parsedStatus === "completed" ? (/* @__PURE__ */ new Date()).toISOString() : null;
  }
  if (category !== void 0) {
    const parsedCategory = parseNonEmptyString(category, 60);
    if (!parsedCategory) {
      res.status(400).json({ error: "category must be a non-empty string" });
      return;
    }
    task.category = parsedCategory;
  }
  if (subtasks !== void 0) {
    const parsedSubtasks = parseSubtasks(subtasks);
    if (parsedSubtasks === null) {
      res.status(400).json({ error: "Invalid subtasks array" });
      return;
    }
    task.subtasks = parsedSubtasks;
  }
  if (recurrence !== void 0) {
    const parsedRecurrence = parseEnum(recurrence, ALLOWED_TASK_RECURRENCES);
    if (!parsedRecurrence) {
      res.status(400).json({ error: "Invalid recurrence value" });
      return;
    }
    task.recurrence = parsedRecurrence;
  }
  if (order !== void 0) {
    const parsedOrder = parseNonNegativeInt(order, 1e5);
    if (parsedOrder === null) {
      res.status(400).json({ error: "Invalid order index" });
      return;
    }
    task.order = parsedOrder;
  }
  if (estimatedPomodoros !== void 0) {
    const parsedEst = parsePositiveInt(estimatedPomodoros, 1, 100);
    if (parsedEst === null) {
      res.status(400).json({ error: "estimatedPomodoros must be an integer between 1 and 100" });
      return;
    }
    task.estimatedPomodoros = parsedEst;
  }
  if (completedPomodoros !== void 0) {
    const parsedCompleted = parseNonNegativeInt(completedPomodoros, 100);
    if (parsedCompleted === null) {
      res.status(400).json({ error: "completedPomodoros must be a non-negative integer" });
      return;
    }
    task.completedPomodoros = parsedCompleted;
  }
  if (dueDate !== void 0) {
    if (dueDate === null || dueDate === "") {
      task.dueDate = null;
    } else {
      const parsedDue = parseIsoDate(dueDate);
      if (!parsedDue) {
        res.status(400).json({ error: "dueDate must be null or YYYY-MM-DD" });
        return;
      }
      task.dueDate = parsedDue;
    }
  }
  if (subjectId !== void 0) {
    task.subjectId = parseOptionalString(subjectId, 128) || null;
  }
  if (subjectCode !== void 0) {
    task.subjectCode = parseOptionalString(subjectCode, 128) || null;
  }
  if (topicId !== void 0) {
    task.topicId = parseOptionalString(topicId, 128) || null;
  }
  if (unit !== void 0) {
    task.unit = parseOptionalString(unit, 128) || null;
  }
  if (subtopicTitle !== void 0) {
    task.subtopicTitle = parseOptionalString(subtopicTitle, 200) || null;
  }
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  task.updatedAt = nowIso;
  if (previousStatus !== "completed" && task.status === "completed" && task.recurrence && task.recurrence !== "none") {
    const nextDue = computeNextRecurrenceDueDate(task.dueDate, task.recurrence);
    const nextTask = {
      id: `tsk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: "todo",
      category: task.category || "General",
      subtasks: (task.subtasks || []).map((s) => ({ ...s, done: false })),
      recurrence: task.recurrence,
      order: task.order ?? 0,
      estimatedPomodoros: task.estimatedPomodoros,
      completedPomodoros: 0,
      dueDate: nextDue,
      completedAt: null,
      deletedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    db.tasks.unshift(nextTask);
  }
  try {
    await dbService.save();
    res.json(task);
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.delete("/tasks/:id", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const task = db.tasks.find(
    (t) => t.id === req.params.id && canAccess(t.userId, userId) && !t.deletedAt
  );
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  task.deletedAt = (/* @__PURE__ */ new Date()).toISOString();
  task.updatedAt = task.deletedAt;
  try {
    await dbService.save();
    res.json({ success: true, message: "Task moved to trash" });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/finance/categories", (req, res) => {
  const auth = getAuth(req);
  dbService.ensureUserWorkspace(auth.userId, auth);
  const db = dbService.getRaw();
  const categories = db.categories.filter((c) => c.userId === auth.userId || c.userId === "system");
  res.json(categories);
});
apiRouter.post("/finance/categories", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { name, type, icon, color } = body;
  const parsedName = parseNonEmptyString(name, 80);
  if (!parsedName) {
    res.status(400).json({ error: "Category name is required" });
    return;
  }
  const parsedType = type === void 0 ? "both" : parseEnum(type, ALLOWED_CATEGORY_TYPES);
  if (!parsedType) {
    res.status(400).json({ error: "Invalid category type" });
    return;
  }
  const category = {
    id: `cat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    name: parsedName,
    type: parsedType,
    icon: typeof icon === "string" && icon.trim() ? icon.trim() : "Tag",
    color: typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color.trim()) ? color.trim() : "#6366f1"
  };
  db.categories.push(category);
  try {
    await dbService.save();
    res.status(201).json(category);
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/finance/summary", (req, res) => {
  const auth = getAuth(req);
  const userId = auth.userId;
  dbService.ensureUserWorkspace(userId, auth);
  dbService.checkRecurringBills(userId);
  const db = dbService.getRaw();
  const filter = req.query.filter || "this_month";
  const customStart = req.query.startDate;
  const customEnd = req.query.endDate;
  const userSettings = db.userSettings.find((s) => s.userId === userId);
  const tz = userSettings?.timezone || DEFAULT_TIMEZONE;
  const todayStr = getTodayDateString(tz);
  let startDateStr = "";
  let endDateStr = "";
  if (filter === "today") {
    startDateStr = todayStr;
    endDateStr = todayStr;
  } else if (filter === "this_week") {
    startDateStr = getStartOfWeek(todayStr);
    endDateStr = getEndOfWeek(todayStr);
  } else if (filter === "this_month") {
    startDateStr = getStartOfMonth(todayStr);
    endDateStr = getEndOfMonth(todayStr);
  } else if (filter === "last_month") {
    const [yStr, mStr] = todayStr.split("-");
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) - 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    const lastMonthSample = `${y}-${String(m).padStart(2, "0")}-01`;
    startDateStr = getStartOfMonth(lastMonthSample);
    endDateStr = getEndOfMonth(lastMonthSample);
  } else if (filter === "custom" && customStart && customEnd) {
    const validStart = parseIsoDate(customStart);
    const validEnd = parseIsoDate(customEnd);
    if (!validStart || !validEnd) {
      res.status(400).json({ error: "Custom range requires valid YYYY-MM-DD startDate and endDate" });
      return;
    }
    startDateStr = validStart;
    endDateStr = validEnd;
  } else {
    startDateStr = getStartOfMonth(todayStr);
    endDateStr = getEndOfMonth(todayStr);
  }
  const incomes = db.incomeTransactions.filter(
    (inc) => inc.userId === userId && !inc.deletedAt && inc.date >= startDateStr && inc.date <= endDateStr
  );
  const totalIncomePaise = incomes.reduce((acc, inc) => acc + inc.amountPaise, 0);
  const expenses = db.expenseTransactions.filter(
    (exp) => exp.userId === userId && !exp.deletedAt && exp.date >= startDateStr && exp.date <= endDateStr
  );
  const totalExpensePaise = expenses.reduce((acc, exp) => acc + exp.amountPaise, 0);
  const fixedExpensesPaise = expenses.filter((e) => e.type === "fixed").reduce((acc, e) => acc + e.amountPaise, 0);
  const variableExpensesPaise = expenses.filter((e) => e.type === "variable").reduce((acc, e) => acc + e.amountPaise, 0);
  const remainingBalancePaise = totalIncomePaise - totalExpensePaise;
  const bills = db.bills.filter(
    (b) => b.userId === userId && !b.deletedAt && b.dueDate >= startDateStr && b.dueDate <= endDateStr
  );
  const paidBills = bills.filter((b) => b.status === "PAID");
  const unpaidBills = bills.filter((b) => b.status === "UNPAID" || b.status === "OVERDUE");
  const totalPaidAmountPaise = paidBills.reduce((acc, b) => acc + b.amountPaise, 0);
  const totalUnpaidAmountPaise = unpaidBills.reduce((acc, b) => acc + b.amountPaise, 0);
  const categoryMap = {};
  for (const exp of expenses) {
    const cat = db.categories.find(
      (c) => c.id === exp.categoryId && (c.userId === userId || c.userId === "usr_atif_default")
    );
    const catId = exp.categoryId || "other";
    const catName = cat?.name || (exp.type === "fixed" ? "Fixed Expense" : "Uncategorized");
    const catColor = cat?.color || "#94a3b8";
    if (!categoryMap[catId]) {
      categoryMap[catId] = { categoryId: catId, name: catName, color: catColor, amountPaise: 0 };
    }
    categoryMap[catId].amountPaise += exp.amountPaise;
  }
  const categoryBreakdown = Object.values(categoryMap).sort((a, b) => b.amountPaise - a.amountPaise);
  const monthlyTrend = [];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [currentY, currentM] = todayStr.split("-").map(Number);
  for (let m = 5; m >= 0; m--) {
    let y = currentY;
    let mo = currentM - m;
    while (mo <= 0) {
      mo += 12;
      y -= 1;
    }
    const key = `${y}-${String(mo).padStart(2, "0")}`;
    const label = `${monthNames[mo - 1]} ${String(y).slice(-2)}`;
    const mInc = db.incomeTransactions.filter((inc) => inc.userId === userId && !inc.deletedAt && inc.date.startsWith(key)).reduce((acc, inc) => acc + inc.amountPaise, 0);
    const mExp = db.expenseTransactions.filter((exp) => exp.userId === userId && !exp.deletedAt && exp.date.startsWith(key)).reduce((acc, exp) => acc + exp.amountPaise, 0);
    monthlyTrend.push({
      month: label,
      incomePaise: mInc,
      expensePaise: mExp
    });
  }
  res.json({
    filter,
    startDate: startDateStr,
    endDate: endDateStr,
    totalIncomePaise,
    totalExpensePaise,
    fixedExpensesPaise,
    variableExpensesPaise,
    remainingBalancePaise,
    totalPaidAmountPaise,
    totalUnpaidAmountPaise,
    paidBillsCount: paidBills.length,
    unpaidBillsCount: unpaidBills.length,
    categoryBreakdown,
    monthlyTrend
  });
});
apiRouter.get("/finance/income", (req, res) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const incomes = db.incomeTransactions.filter((inc) => inc.userId === userId && !inc.deletedAt).sort((a, b) => b.date.localeCompare(a.date));
  res.json(incomes);
});
apiRouter.post("/finance/income", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { source, amountPaise, date, category, notes } = body;
  const parsedSource = parseNonEmptyString(source, 200);
  if (!parsedSource) {
    res.status(400).json({ error: "Income source is required" });
    return;
  }
  const parsedAmount = parsePositiveInt(amountPaise, 1, 1e9);
  if (parsedAmount === null) {
    res.status(400).json({ error: "Valid positive integer amountPaise is required" });
    return;
  }
  const parsedDate = date === void 0 || date === "" ? getTodayDateString(DEFAULT_TIMEZONE) : parseIsoDate(date);
  if (!parsedDate) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }
  const parsedCategory = category === void 0 ? "Salary" : parseNonEmptyString(category, 80);
  if (!parsedCategory) {
    res.status(400).json({ error: "Invalid category" });
    return;
  }
  const parsedNotes = parseOptionalString(notes, 1e3);
  if (parsedNotes === null) {
    res.status(400).json({ error: "notes must be a string" });
    return;
  }
  const newIncome = {
    id: `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    source: parsedSource,
    amountPaise: parsedAmount,
    date: parsedDate,
    category: parsedCategory,
    notes: parsedNotes,
    deletedAt: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.incomeTransactions.unshift(newIncome);
  try {
    await dbService.save();
    res.status(201).json(newIncome);
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.put("/finance/income/:id", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const income = db.incomeTransactions.find(
    (inc) => inc.id === req.params.id && inc.userId === userId && !inc.deletedAt
  );
  if (!income) {
    res.status(404).json({ error: "Income record not found" });
    return;
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { source, amountPaise, date, category, notes } = body;
  if (source !== void 0) {
    const parsedSource = parseNonEmptyString(source, 200);
    if (!parsedSource) {
      res.status(400).json({ error: "source must be a non-empty string" });
      return;
    }
    income.source = parsedSource;
  }
  if (amountPaise !== void 0) {
    const parsedAmount = parsePositiveInt(amountPaise, 1, 1e9);
    if (parsedAmount === null) {
      res.status(400).json({ error: "amountPaise must be a positive integer" });
      return;
    }
    income.amountPaise = parsedAmount;
  }
  if (date !== void 0) {
    const parsedDate = parseIsoDate(date);
    if (!parsedDate) {
      res.status(400).json({ error: "date must be YYYY-MM-DD" });
      return;
    }
    income.date = parsedDate;
  }
  if (category !== void 0) {
    const parsedCategory = parseNonEmptyString(category, 80);
    if (!parsedCategory) {
      res.status(400).json({ error: "category must be a non-empty string" });
      return;
    }
    income.category = parsedCategory;
  }
  if (notes !== void 0) {
    const parsedNotes = parseOptionalString(notes, 1e3);
    if (parsedNotes === null) {
      res.status(400).json({ error: "notes must be a string" });
      return;
    }
    income.notes = parsedNotes;
  }
  try {
    await dbService.save();
    res.json(income);
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.delete("/finance/income/:id", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const income = db.incomeTransactions.find(
    (inc) => inc.id === req.params.id && canAccess(inc.userId, userId) && !inc.deletedAt
  );
  if (!income) {
    res.status(404).json({ error: "Income record not found" });
    return;
  }
  income.deletedAt = (/* @__PURE__ */ new Date()).toISOString();
  try {
    await dbService.save();
    res.json({ success: true, message: "Income record moved to trash" });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/finance/expenses", (req, res) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const typeFilter = req.query.type;
  let expenses = db.expenseTransactions.filter((e) => e.userId === userId && !e.deletedAt);
  if (typeFilter === "fixed" || typeFilter === "variable") {
    expenses = expenses.filter((e) => e.type === typeFilter);
  }
  const mapped = expenses.map((e) => ({
    ...e,
    categoryName: db.categories.find(
      (c) => c.id === e.categoryId && (c.userId === userId || c.userId === "usr_atif_default")
    )?.name || "Uncategorized",
    categoryColor: db.categories.find(
      (c) => c.id === e.categoryId && (c.userId === userId || c.userId === "usr_atif_default")
    )?.color || "#6366f1"
  })).sort((a, b) => b.date.localeCompare(a.date));
  res.json(mapped);
});
apiRouter.post("/finance/expenses", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { categoryId, amountPaise, date, description, paymentMethod, notes, type } = body;
  const parsedDesc = parseNonEmptyString(description, 250);
  if (!parsedDesc) {
    res.status(400).json({ error: "Description is required" });
    return;
  }
  const parsedAmount = parsePositiveInt(amountPaise, 1, 1e9);
  if (parsedAmount === null) {
    res.status(400).json({ error: "Valid positive integer amountPaise is required" });
    return;
  }
  const parsedDate = date === void 0 || date === "" ? getTodayDateString(DEFAULT_TIMEZONE) : parseIsoDate(date);
  if (!parsedDate) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }
  const parsedMethod = paymentMethod === void 0 ? "upi_bank" : parseEnum(paymentMethod, ALLOWED_PAYMENT_METHODS);
  if (!parsedMethod) {
    res.status(400).json({ error: "Invalid paymentMethod" });
    return;
  }
  if (type !== void 0 && type !== "fixed" && type !== "variable") {
    res.status(400).json({ error: "type must be fixed or variable" });
    return;
  }
  const parsedNotes = parseOptionalString(notes, 1e3);
  if (parsedNotes === null) {
    res.status(400).json({ error: "notes must be a string" });
    return;
  }
  const rawCatName = typeof body.categoryName === "string" && body.categoryName.trim() ? body.categoryName.trim() : null;
  let resolvedCategoryId = null;
  if (typeof categoryId === "string" && categoryId.trim()) {
    const directMatch = db.categories.find((c) => c.id === categoryId.trim() && (c.userId === userId || c.userId === "usr_atif_default"));
    if (directMatch) {
      resolvedCategoryId = directMatch.id;
    } else {
      const nameMatch = db.categories.find(
        (c) => (c.userId === userId || c.userId === "usr_atif_default") && c.name.trim().toLowerCase() === categoryId.trim().toLowerCase()
      ) || db.categories.find(
        (c) => (c.userId === userId || c.userId === "usr_atif_default") && (c.name.toLowerCase().includes(categoryId.trim().toLowerCase()) || categoryId.trim().toLowerCase().includes(c.name.toLowerCase()))
      );
      if (nameMatch) {
        resolvedCategoryId = nameMatch.id;
      }
    }
  }
  if (!resolvedCategoryId && rawCatName) {
    const nameMatch = db.categories.find(
      (c) => (c.userId === userId || c.userId === "usr_atif_default") && c.name.trim().toLowerCase() === rawCatName.toLowerCase()
    ) || db.categories.find(
      (c) => (c.userId === userId || c.userId === "usr_atif_default") && (c.name.toLowerCase().includes(rawCatName.toLowerCase()) || rawCatName.toLowerCase().includes(c.name.toLowerCase()))
    );
    if (nameMatch) {
      resolvedCategoryId = nameMatch.id;
    }
  }
  if (!resolvedCategoryId) {
    resolvedCategoryId = dbService.getFallbackCategoryId(userId);
  }
  const newExpense = {
    id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    billId: null,
    type: type === "fixed" ? "fixed" : "variable",
    categoryId: resolvedCategoryId,
    amountPaise: parsedAmount,
    date: parsedDate,
    description: parsedDesc,
    paymentMethod: parsedMethod,
    notes: parsedNotes,
    deletedAt: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.expenseTransactions.unshift(newExpense);
  try {
    await dbService.save();
    res.status(201).json({
      ...newExpense,
      categoryName: db.categories.find((c) => c.id === newExpense.categoryId)?.name || "Expense"
    });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.put("/finance/expenses/:id", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const expense = db.expenseTransactions.find(
    (e) => e.id === req.params.id && e.userId === userId && !e.deletedAt
  );
  if (!expense) {
    res.status(404).json({ error: "Expense record not found" });
    return;
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { categoryId, amountPaise, date, description, paymentMethod, notes, type } = body;
  if (categoryId !== void 0) {
    if (typeof categoryId !== "string" || !categoryId.trim()) {
      res.status(400).json({ error: "Invalid categoryId", code: "INVALID_CATEGORY" });
      return;
    }
    const trimmedCat = categoryId.trim();
    const catExists = db.categories.some(
      (c) => c.id === trimmedCat && (c.userId === userId || c.userId === "usr_atif_default")
    );
    if (!catExists) {
      res.status(400).json({ error: "Referenced category does not exist or belongs to another user", code: "INVALID_CATEGORY" });
      return;
    }
    expense.categoryId = trimmedCat;
  }
  if (amountPaise !== void 0) {
    const parsedAmount = parsePositiveInt(amountPaise, 1, 1e9);
    if (parsedAmount === null) {
      res.status(400).json({ error: "amountPaise must be a positive integer" });
      return;
    }
    expense.amountPaise = parsedAmount;
  }
  if (date !== void 0) {
    const parsedDate = parseIsoDate(date);
    if (!parsedDate) {
      res.status(400).json({ error: "date must be YYYY-MM-DD" });
      return;
    }
    expense.date = parsedDate;
  }
  if (description !== void 0) {
    const parsedDesc = parseNonEmptyString(description, 250);
    if (!parsedDesc) {
      res.status(400).json({ error: "description must be a non-empty string" });
      return;
    }
    expense.description = parsedDesc;
  }
  if (paymentMethod !== void 0) {
    const parsedMethod = parseEnum(paymentMethod, ALLOWED_PAYMENT_METHODS);
    if (!parsedMethod) {
      res.status(400).json({ error: "Invalid paymentMethod" });
      return;
    }
    expense.paymentMethod = parsedMethod;
  }
  if (notes !== void 0) {
    const parsedNotes = parseOptionalString(notes, 1e3);
    if (parsedNotes === null) {
      res.status(400).json({ error: "notes must be a string" });
      return;
    }
    expense.notes = parsedNotes;
  }
  if (type !== void 0) {
    if (type !== "fixed" && type !== "variable") {
      res.status(400).json({ error: "type must be fixed or variable" });
      return;
    }
    expense.type = type;
  }
  try {
    await dbService.save();
    res.json({
      ...expense,
      categoryName: db.categories.find((c) => c.id === expense.categoryId)?.name || "Expense"
    });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.delete("/finance/expenses/:id", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const expense = db.expenseTransactions.find(
    (e) => e.id === req.params.id && canAccess(e.userId, userId) && !e.deletedAt
  );
  if (!expense) {
    res.status(404).json({ error: "Expense record not found" });
    return;
  }
  expense.deletedAt = (/* @__PURE__ */ new Date()).toISOString();
  try {
    await dbService.save();
    res.json({ success: true, message: "Expense record moved to trash" });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/finance/recurring", (req, res) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const recurring = db.recurringExpenses.filter((r) => r.userId === userId).map((r) => ({
    ...r,
    categoryName: db.categories.find((c) => c.id === r.categoryId)?.name || "Fixed Expense"
  })).sort((a, b) => a.dueDay - b.dueDay);
  res.json(recurring);
});
apiRouter.post("/finance/recurring", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { name, amountPaise, categoryId, recurrence, dueDay, notes } = body;
  const parsedName = parseNonEmptyString(name, 200);
  if (!parsedName) {
    res.status(400).json({ error: "Expense name is required" });
    return;
  }
  const parsedAmount = parsePositiveInt(amountPaise, 1, 1e9);
  if (parsedAmount === null) {
    res.status(400).json({ error: "Valid positive integer amountPaise is required" });
    return;
  }
  const parsedRecurrence = recurrence === void 0 ? "monthly" : parseEnum(recurrence, ALLOWED_RECURRENCES);
  if (!parsedRecurrence) {
    res.status(400).json({ error: "Invalid recurrence frequency" });
    return;
  }
  const parsedDueDay = dueDay === void 0 ? 1 : parsePositiveInt(dueDay, 1, 31);
  if (parsedDueDay === null) {
    res.status(400).json({ error: "dueDay must be an integer between 1 and 31" });
    return;
  }
  const parsedNotes = parseOptionalString(notes, 1e3);
  if (parsedNotes === null) {
    res.status(400).json({ error: "notes must be a string" });
    return;
  }
  const rawCatName = typeof body.categoryName === "string" && body.categoryName.trim() ? body.categoryName.trim() : null;
  let resolvedCategoryId = null;
  if (typeof categoryId === "string" && categoryId.trim()) {
    const directMatch = db.categories.find((c) => c.id === categoryId.trim() && (c.userId === userId || c.userId === "usr_atif_default"));
    if (directMatch) {
      resolvedCategoryId = directMatch.id;
    } else {
      const nameMatch = db.categories.find(
        (c) => (c.userId === userId || c.userId === "usr_atif_default") && c.name.trim().toLowerCase() === categoryId.trim().toLowerCase()
      ) || db.categories.find(
        (c) => (c.userId === userId || c.userId === "usr_atif_default") && (c.name.toLowerCase().includes(categoryId.trim().toLowerCase()) || categoryId.trim().toLowerCase().includes(c.name.toLowerCase()))
      );
      if (nameMatch) {
        resolvedCategoryId = nameMatch.id;
      }
    }
  }
  if (!resolvedCategoryId && rawCatName) {
    const nameMatch = db.categories.find(
      (c) => (c.userId === userId || c.userId === "usr_atif_default") && c.name.trim().toLowerCase() === rawCatName.toLowerCase()
    ) || db.categories.find(
      (c) => (c.userId === userId || c.userId === "usr_atif_default") && (c.name.toLowerCase().includes(rawCatName.toLowerCase()) || rawCatName.toLowerCase().includes(c.name.toLowerCase()))
    );
    if (nameMatch) {
      resolvedCategoryId = nameMatch.id;
    }
  }
  if (!resolvedCategoryId) {
    resolvedCategoryId = dbService.getFallbackCategoryId(userId);
  }
  const newRec = {
    id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    name: parsedName,
    amountPaise: parsedAmount,
    categoryId: resolvedCategoryId,
    recurrence: parsedRecurrence,
    dueDay: parsedDueDay,
    isActive: true,
    notes: parsedNotes,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.recurringExpenses.push(newRec);
  try {
    await dbService.save();
    dbService.checkRecurringBills(userId);
    res.status(201).json({
      ...newRec,
      categoryName: db.categories.find((c) => c.id === newRec.categoryId)?.name || "Fixed Expense"
    });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.put("/finance/recurring/:id", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const rec = db.recurringExpenses.find((r) => r.id === req.params.id && r.userId === userId);
  if (!rec) {
    res.status(404).json({ error: "Recurring expense not found" });
    return;
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { name, amountPaise, categoryId, recurrence, dueDay, isActive, notes } = body;
  if (name !== void 0) {
    const parsedName = parseNonEmptyString(name, 200);
    if (!parsedName) {
      res.status(400).json({ error: "name must be a non-empty string" });
      return;
    }
    rec.name = parsedName;
  }
  if (amountPaise !== void 0) {
    const parsedAmount = parsePositiveInt(amountPaise, 1, 1e9);
    if (parsedAmount === null) {
      res.status(400).json({ error: "amountPaise must be a positive integer" });
      return;
    }
    rec.amountPaise = parsedAmount;
  }
  if (categoryId !== void 0) {
    if (typeof categoryId !== "string" || !categoryId.trim()) {
      res.status(400).json({ error: "Invalid categoryId", code: "INVALID_CATEGORY" });
      return;
    }
    const trimmedCat = categoryId.trim();
    const catExists = db.categories.some(
      (c) => c.id === trimmedCat && (c.userId === userId || c.userId === "usr_atif_default")
    );
    if (!catExists) {
      res.status(400).json({ error: "Referenced category does not exist or belongs to another user", code: "INVALID_CATEGORY" });
      return;
    }
    rec.categoryId = trimmedCat;
  }
  if (recurrence !== void 0) {
    const parsedRecurrence = parseEnum(recurrence, ALLOWED_RECURRENCES);
    if (!parsedRecurrence) {
      res.status(400).json({ error: "Invalid recurrence" });
      return;
    }
    rec.recurrence = parsedRecurrence;
  }
  if (dueDay !== void 0) {
    const parsedDueDay = parsePositiveInt(dueDay, 1, 31);
    if (parsedDueDay === null) {
      res.status(400).json({ error: "dueDay must be an integer between 1 and 31" });
      return;
    }
    rec.dueDay = parsedDueDay;
  }
  if (isActive !== void 0) {
    if (typeof isActive !== "boolean") {
      res.status(400).json({ error: "isActive must be a boolean" });
      return;
    }
    rec.isActive = isActive;
  }
  if (notes !== void 0) {
    const parsedNotes = parseOptionalString(notes, 1e3);
    if (parsedNotes === null) {
      res.status(400).json({ error: "notes must be a string" });
      return;
    }
    rec.notes = parsedNotes;
  }
  rec.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  try {
    await dbService.save();
    res.json({
      ...rec,
      categoryName: db.categories.find((c) => c.id === rec.categoryId)?.name || "Fixed Expense"
    });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.delete("/finance/recurring/:id", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const index = db.recurringExpenses.findIndex(
    (r) => r.id === req.params.id && canAccess(r.userId, userId)
  );
  if (index === -1) {
    res.status(404).json({ error: "Recurring expense not found" });
    return;
  }
  db.recurringExpenses.splice(index, 1);
  try {
    await dbService.save();
    res.json({ success: true, message: "Recurring expense removed" });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/finance/bills", (req, res) => {
  const auth = getAuth(req);
  const userId = auth.userId;
  dbService.ensureUserWorkspace(userId, auth);
  dbService.checkRecurringBills(userId);
  const db = dbService.getRaw();
  const statusFilter = req.query.status;
  let bills = db.bills.filter((b) => b.userId === userId && !b.deletedAt);
  if (statusFilter && statusFilter !== "ALL") {
    if (statusFilter === "UNPAID") {
      bills = bills.filter((b) => b.status === "UNPAID" || b.status === "OVERDUE");
    } else {
      bills = bills.filter((b) => b.status === statusFilter);
    }
  }
  const mapped = bills.map((b) => ({
    ...b,
    categoryName: db.categories.find((c) => c.id === b.categoryId)?.name || "Bill",
    categoryColor: db.categories.find((c) => c.id === b.categoryId)?.color || "#6366f1"
  })).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  res.json(mapped);
});
apiRouter.post("/finance/bills", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { name, amountPaise, categoryId, dueDate, notes } = body;
  const parsedName = parseNonEmptyString(name, 200);
  if (!parsedName) {
    res.status(400).json({ error: "Bill name is required" });
    return;
  }
  const parsedAmount = parsePositiveInt(amountPaise, 1, 1e9);
  if (parsedAmount === null) {
    res.status(400).json({ error: "Valid positive integer amountPaise is required" });
    return;
  }
  const parsedDueDate = parseIsoDate(dueDate);
  if (!parsedDueDate) {
    res.status(400).json({ error: "Valid dueDate (YYYY-MM-DD) is required" });
    return;
  }
  const parsedNotes = parseOptionalString(notes, 1e3);
  if (parsedNotes === null) {
    res.status(400).json({ error: "notes must be a string" });
    return;
  }
  const todayStr = getTodayDateString(DEFAULT_TIMEZONE);
  const isPastDue = parsedDueDate < todayStr;
  const periodKey = parsedDueDate.substring(0, 7);
  const rawCatName = typeof body.categoryName === "string" && body.categoryName.trim() ? body.categoryName.trim() : null;
  let resolvedCategoryId = null;
  if (typeof categoryId === "string" && categoryId.trim()) {
    const directMatch = db.categories.find((c) => c.id === categoryId.trim() && (c.userId === userId || c.userId === "usr_atif_default"));
    if (directMatch) {
      resolvedCategoryId = directMatch.id;
    } else {
      const nameMatch = db.categories.find(
        (c) => (c.userId === userId || c.userId === "usr_atif_default") && c.name.trim().toLowerCase() === categoryId.trim().toLowerCase()
      ) || db.categories.find(
        (c) => (c.userId === userId || c.userId === "usr_atif_default") && (c.name.toLowerCase().includes(categoryId.trim().toLowerCase()) || categoryId.trim().toLowerCase().includes(c.name.toLowerCase()))
      );
      if (nameMatch) {
        resolvedCategoryId = nameMatch.id;
      }
    }
  }
  if (!resolvedCategoryId && rawCatName) {
    const nameMatch = db.categories.find(
      (c) => (c.userId === userId || c.userId === "usr_atif_default") && c.name.trim().toLowerCase() === rawCatName.toLowerCase()
    ) || db.categories.find(
      (c) => (c.userId === userId || c.userId === "usr_atif_default") && (c.name.toLowerCase().includes(rawCatName.toLowerCase()) || rawCatName.toLowerCase().includes(c.name.toLowerCase()))
    );
    if (nameMatch) {
      resolvedCategoryId = nameMatch.id;
    }
  }
  if (!resolvedCategoryId) {
    resolvedCategoryId = dbService.getFallbackCategoryId(userId);
  }
  const newBill = {
    id: `bill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    recurringExpenseId: null,
    name: parsedName,
    amountPaise: parsedAmount,
    categoryId: resolvedCategoryId,
    dueDate: parsedDueDate,
    status: isPastDue ? "OVERDUE" : "UNPAID",
    paymentDate: null,
    notes: parsedNotes,
    periodKey,
    deletedAt: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.bills.unshift(newBill);
  try {
    await dbService.save();
    res.status(201).json({
      ...newBill,
      categoryName: db.categories.find((c) => c.id === newBill.categoryId)?.name || "Bill"
    });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.post("/finance/bills/:id/pay", async (req, res, next) => {
  const { userId } = getAuth(req);
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { paidDate, paymentMethod, notes, idempotencyKey } = body;
  let validPaidDate;
  if (paidDate !== void 0 && paidDate !== "") {
    const parsed = parseIsoDate(paidDate);
    if (!parsed) {
      res.status(400).json({ error: "paidDate must be YYYY-MM-DD" });
      return;
    }
    validPaidDate = parsed;
  }
  const parsedMethod = paymentMethod === void 0 ? "upi_bank" : parseEnum(paymentMethod, ALLOWED_PAYMENT_METHODS);
  if (!parsedMethod) {
    res.status(400).json({ error: "Invalid paymentMethod" });
    return;
  }
  const parsedNotes = parseOptionalString(notes, 1e3);
  if (parsedNotes === null) {
    res.status(400).json({ error: "notes must be a string" });
    return;
  }
  const parsedIdemKey = typeof idempotencyKey === "string" && idempotencyKey.trim() ? idempotencyKey.trim().slice(0, 128) : void 0;
  try {
    const result = dbService.markBillAsPaid(
      userId,
      req.params.id,
      validPaidDate,
      parsedMethod,
      parsedNotes,
      parsedIdemKey
    );
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    await dbService.flush();
    const db = dbService.getRaw();
    const bill = result.bill;
    res.json({
      success: true,
      bill: {
        ...bill,
        categoryName: db.categories.find((c) => c.id === bill.categoryId)?.name || "Bill"
      }
    });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.post("/finance/bills/:id/undo", async (req, res, next) => {
  const { userId } = getAuth(req);
  try {
    const result = dbService.undoBillPayment(userId, req.params.id);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    await dbService.flush();
    const db = dbService.getRaw();
    const bill = result.bill;
    res.json({
      success: true,
      bill: {
        ...bill,
        categoryName: db.categories.find((c) => c.id === bill.categoryId)?.name || "Bill"
      }
    });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.delete("/finance/bills/:id", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const bill = db.bills.find(
    (b) => b.id === req.params.id && canAccess(b.userId, userId) && !b.deletedAt
  );
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  bill.deletedAt = nowIso;
  bill.updatedAt = nowIso;
  for (const exp of db.expenseTransactions) {
    if (canAccess(exp.userId, userId) && exp.billId === bill.id && !exp.deletedAt) {
      exp.deletedAt = nowIso;
    }
  }
  try {
    await dbService.save();
    res.json({ success: true, message: "Bill moved to trash" });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/finance/payments-history", (req, res) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const history = db.paymentHistory.filter((p) => p.userId === userId).sort((a, b) => b.paidDate.localeCompare(a.paidDate));
  res.json(history);
});
apiRouter.get("/finance/savings-goals", (req, res) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const goals = db.savingsGoals.filter((g) => g.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(goals);
});
apiRouter.post("/finance/savings-goals", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { title, targetPaise, savedPaise, targetDate, color } = body;
  const parsedTitle = parseNonEmptyString(title, 150);
  if (!parsedTitle) {
    res.status(400).json({ error: "Savings goal title is required" });
    return;
  }
  const parsedTarget = parsePositiveInt(targetPaise, 100, 1e9);
  if (parsedTarget === null) {
    res.status(400).json({ error: "targetPaise must be a positive integer" });
    return;
  }
  const parsedSaved = savedPaise === void 0 ? 0 : parseNonNegativeInt(savedPaise, 1e9);
  if (parsedSaved === null) {
    res.status(400).json({ error: "savedPaise must be a non-negative integer" });
    return;
  }
  let parsedDate = null;
  if (targetDate !== void 0 && targetDate !== null && targetDate !== "") {
    parsedDate = parseIsoDate(targetDate);
    if (!parsedDate) {
      res.status(400).json({ error: "targetDate must be YYYY-MM-DD" });
      return;
    }
  }
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const created = {
    id: `sav_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    title: parsedTitle,
    targetPaise: parsedTarget,
    savedPaise: parsedSaved,
    targetDate: parsedDate,
    color: typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color.trim()) ? color.trim() : "#10b981",
    createdAt: nowIso,
    updatedAt: nowIso
  };
  db.savingsGoals.unshift(created);
  try {
    await dbService.save();
    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.put("/finance/savings-goals/:id", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const goal = db.savingsGoals.find((g) => g.id === req.params.id && g.userId === userId);
  if (!goal) {
    res.status(404).json({ error: "Savings goal not found" });
    return;
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { title, targetPaise, savedPaise, targetDate, color } = body;
  if (title !== void 0) {
    const parsedTitle = parseNonEmptyString(title, 150);
    if (!parsedTitle) {
      res.status(400).json({ error: "Invalid title" });
      return;
    }
    goal.title = parsedTitle;
  }
  if (targetPaise !== void 0) {
    const parsedTarget = parsePositiveInt(targetPaise, 100, 1e9);
    if (parsedTarget === null) {
      res.status(400).json({ error: "Invalid targetPaise" });
      return;
    }
    goal.targetPaise = parsedTarget;
  }
  if (savedPaise !== void 0) {
    const parsedSaved = parseNonNegativeInt(savedPaise, 1e9);
    if (parsedSaved === null) {
      res.status(400).json({ error: "Invalid savedPaise" });
      return;
    }
    goal.savedPaise = parsedSaved;
  }
  if (targetDate !== void 0) {
    if (targetDate === null || targetDate === "") {
      goal.targetDate = null;
    } else {
      const parsedDate = parseIsoDate(targetDate);
      if (!parsedDate) {
        res.status(400).json({ error: "targetDate must be YYYY-MM-DD" });
        return;
      }
      goal.targetDate = parsedDate;
    }
  }
  if (color !== void 0 && typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color.trim())) {
    goal.color = color.trim();
  }
  goal.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  try {
    await dbService.save();
    res.json(goal);
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.post("/finance/savings-goals/:id/contribute", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const goal = db.savingsGoals.find((g) => g.id === req.params.id && g.userId === userId);
  if (!goal) {
    res.status(404).json({ error: "Savings goal not found" });
    return;
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const delta = Number(body.deltaPaise);
  if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0) {
    res.status(400).json({ error: "deltaPaise must be a non-zero integer" });
    return;
  }
  if (goal.savedPaise + delta < 0) {
    res.status(400).json({ error: "Cannot withdraw more than current saved amount" });
    return;
  }
  goal.savedPaise = goal.savedPaise + delta;
  goal.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  try {
    await dbService.save();
    res.json(goal);
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.delete("/finance/savings-goals/:id", async (req, res, next) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const idx = db.savingsGoals.findIndex(
    (g) => g.id === req.params.id && canAccess(g.userId, userId)
  );
  if (idx === -1) {
    res.status(404).json({ error: "Savings goal not found" });
    return;
  }
  db.savingsGoals.splice(idx, 1);
  try {
    await dbService.save();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/trash", (req, res) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const items = [
    ...db.tasks.filter((t) => t.userId === userId && t.deletedAt).map((t) => ({
      id: t.id,
      entityType: "task",
      title: t.title,
      subtitle: `Task \xB7 ${t.priority} priority`,
      deletedAt: t.deletedAt
    })),
    ...db.incomeTransactions.filter((i) => i.userId === userId && i.deletedAt).map((i) => ({
      id: i.id,
      entityType: "income",
      title: i.source,
      subtitle: `Income \xB7 ${i.date}`,
      amountPaise: i.amountPaise,
      deletedAt: i.deletedAt
    })),
    ...db.expenseTransactions.filter((e) => e.userId === userId && e.deletedAt).map((e) => ({
      id: e.id,
      entityType: "expense",
      title: e.description,
      subtitle: `Expense \xB7 ${e.date}`,
      amountPaise: e.amountPaise,
      deletedAt: e.deletedAt
    })),
    ...db.bills.filter((b) => b.userId === userId && b.deletedAt).map((b) => ({
      id: b.id,
      entityType: "bill",
      title: b.name,
      subtitle: `Bill \xB7 Due ${b.dueDate}`,
      amountPaise: b.amountPaise,
      deletedAt: b.deletedAt
    })),
    ...(db.timeBlocks || []).filter((tb) => tb.userId === userId && tb.deletedAt).map((tb) => ({
      id: tb.id,
      entityType: "time_block",
      title: tb.title,
      subtitle: `Time Block \xB7 ${tb.date}`,
      deletedAt: tb.deletedAt
    })),
    ...(db.envelopes || []).filter((env) => env.userId === userId && env.deletedAt).map((env) => ({
      id: env.id,
      entityType: "envelope",
      title: env.name,
      subtitle: `Envelope \xB7 ${env.monthKey}`,
      amountPaise: env.allocatedPaise,
      deletedAt: env.deletedAt
    })),
    ...(db.subscriptions || []).filter((s) => s.userId === userId && s.deletedAt).map((s) => ({
      id: s.id,
      entityType: "subscription",
      title: s.name,
      subtitle: `Subscription \xB7 ${s.billingCycle}`,
      amountPaise: s.amountPaise,
      deletedAt: s.deletedAt
    }))
  ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  res.json(items);
});
apiRouter.post("/trash/:entityType/:id/restore", async (req, res, next) => {
  const { userId } = getAuth(req);
  const { entityType, id } = req.params;
  const db = dbService.getRaw();
  if (entityType === "task") {
    const item = db.tasks.find((t) => t.id === id && t.userId === userId && t.deletedAt);
    if (!item) {
      res.status(404).json({ error: "Trashed task not found" });
      return;
    }
    item.deletedAt = null;
    item.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  } else if (entityType === "income") {
    const item = db.incomeTransactions.find((i) => i.id === id && i.userId === userId && i.deletedAt);
    if (!item) {
      res.status(404).json({ error: "Trashed income not found" });
      return;
    }
    item.deletedAt = null;
  } else if (entityType === "expense") {
    const item = db.expenseTransactions.find((e) => e.id === id && e.userId === userId && e.deletedAt);
    if (!item) {
      res.status(404).json({ error: "Trashed expense not found" });
      return;
    }
    item.deletedAt = null;
  } else if (entityType === "bill") {
    const item = db.bills.find((b) => b.id === id && b.userId === userId && b.deletedAt);
    if (!item) {
      res.status(404).json({ error: "Trashed bill not found" });
      return;
    }
    item.deletedAt = null;
    for (const exp of db.expenseTransactions) {
      if (exp.userId === userId && exp.billId === item.id && exp.deletedAt) {
        exp.deletedAt = null;
      }
    }
  } else if (entityType === "time_block") {
    const item = (db.timeBlocks || []).find((tb) => tb.id === id && tb.userId === userId && tb.deletedAt);
    if (!item) {
      res.status(404).json({ error: "Trashed time block not found" });
      return;
    }
    item.deletedAt = null;
    item.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  } else if (entityType === "envelope") {
    const item = (db.envelopes || []).find((env) => env.id === id && env.userId === userId && env.deletedAt);
    if (!item) {
      res.status(404).json({ error: "Trashed envelope not found" });
      return;
    }
    item.deletedAt = null;
    item.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  } else if (entityType === "subscription") {
    const item = (db.subscriptions || []).find((sub) => sub.id === id && sub.userId === userId && sub.deletedAt);
    if (!item) {
      res.status(404).json({ error: "Trashed subscription not found" });
      return;
    }
    item.deletedAt = null;
    item.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  } else {
    res.status(400).json({ error: "Invalid entity type" });
    return;
  }
  try {
    await dbService.save();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.delete("/trash/:entityType/:id", async (req, res, next) => {
  const { userId } = getAuth(req);
  const { entityType, id } = req.params;
  const db = dbService.getRaw();
  if (entityType === "task") {
    const idx = db.tasks.findIndex((t) => t.id === id && t.userId === userId && t.deletedAt);
    if (idx === -1) {
      res.status(404).json({ error: "Trashed task not found" });
      return;
    }
    db.tasks.splice(idx, 1);
  } else if (entityType === "income") {
    const idx = db.incomeTransactions.findIndex((i) => i.id === id && i.userId === userId && i.deletedAt);
    if (idx === -1) {
      res.status(404).json({ error: "Trashed income not found" });
      return;
    }
    db.incomeTransactions.splice(idx, 1);
  } else if (entityType === "expense") {
    const idx = db.expenseTransactions.findIndex((e) => e.id === id && e.userId === userId && e.deletedAt);
    if (idx === -1) {
      res.status(404).json({ error: "Trashed expense not found" });
      return;
    }
    db.expenseTransactions.splice(idx, 1);
  } else if (entityType === "bill") {
    const idx = db.bills.findIndex((b) => b.id === id && b.userId === userId && b.deletedAt);
    if (idx === -1) {
      res.status(404).json({ error: "Trashed bill not found" });
      return;
    }
    const bill = db.bills[idx];
    db.expenseTransactions = db.expenseTransactions.filter(
      (e) => !(e.userId === userId && e.billId === bill.id)
    );
    db.paymentHistory = db.paymentHistory.filter(
      (p) => !(p.userId === userId && p.billId === bill.id)
    );
    db.bills.splice(idx, 1);
  } else if (entityType === "time_block") {
    const idx = (db.timeBlocks || []).findIndex((tb) => tb.id === id && tb.userId === userId && tb.deletedAt);
    if (idx === -1) {
      res.status(404).json({ error: "Trashed time block not found" });
      return;
    }
    db.timeBlocks.splice(idx, 1);
  } else if (entityType === "envelope") {
    const idx = (db.envelopes || []).findIndex((env) => env.id === id && env.userId === userId && env.deletedAt);
    if (idx === -1) {
      res.status(404).json({ error: "Trashed envelope not found" });
      return;
    }
    db.envelopes.splice(idx, 1);
  } else if (entityType === "subscription") {
    const idx = (db.subscriptions || []).findIndex((sub) => sub.id === id && sub.userId === userId && sub.deletedAt);
    if (idx === -1) {
      res.status(404).json({ error: "Trashed subscription not found" });
      return;
    }
    db.subscriptions.splice(idx, 1);
  } else {
    res.status(400).json({ error: "Invalid entity type" });
    return;
  }
  try {
    await dbService.save();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/time-blocks", (req, res) => {
  const { userId } = getAuth(req);
  const date = typeof req.query.date === "string" ? req.query.date : void 0;
  const blocks = dbService.getTimeBlocks(userId, date);
  res.json(blocks);
});
apiRouter.post("/time-blocks", async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    const body = req.body || {};
    const block = dbService.saveTimeBlock(userId, body);
    await dbService.flush();
    res.status(201).json(block);
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.put("/time-blocks/:id", async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    const body = req.body || {};
    const block = dbService.saveTimeBlock(userId, { ...body, id });
    await dbService.flush();
    res.json(block);
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.delete("/time-blocks/:id", async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    const ok = dbService.deleteTimeBlock(userId, id);
    if (!ok) {
      res.status(404).json({ error: "Time block not found" });
      return;
    }
    await dbService.flush();
    res.json({ success: true, message: "Time block moved to trash" });
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/envelopes", (req, res) => {
  const { userId } = getAuth(req);
  const monthKey = typeof req.query.monthKey === "string" ? req.query.monthKey : void 0;
  const envelopes = dbService.getEnvelopes(userId, monthKey);
  res.json(envelopes);
});
apiRouter.post("/envelopes", async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    const body = req.body || {};
    const env = dbService.saveEnvelope(userId, body);
    await dbService.flush();
    res.status(201).json(env);
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.put("/envelopes/:id", async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    const body = req.body || {};
    const env = dbService.saveEnvelope(userId, { ...body, id });
    await dbService.flush();
    res.json(env);
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.delete("/envelopes/:id", async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    const ok = dbService.deleteEnvelope(userId, id);
    if (!ok) {
      res.status(404).json({ error: "Envelope not found" });
      return;
    }
    await dbService.flush();
    res.json({ success: true, message: "Envelope moved to trash" });
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.post("/envelopes/transfer", async (req, res, next) => {
  const { userId } = getAuth(req);
  const { fromId, toId, amountPaise } = req.body || {};
  const parsedFromId = parseNonEmptyString(fromId, 128);
  const parsedToId = parseNonEmptyString(toId, 128);
  const parsedAmount = parsePositiveInt(amountPaise, 1, 1e12);
  if (!parsedFromId || !parsedToId || !parsedAmount) {
    res.status(400).json({ error: "Valid fromId, toId, and positive integer amountPaise are required" });
    return;
  }
  if (parsedFromId === parsedToId) {
    res.status(400).json({ error: "Cannot transfer funds to the same envelope" });
    return;
  }
  try {
    const result = dbService.transferEnvelopeFunds(userId, parsedFromId, parsedToId, parsedAmount);
    if (!result.success) {
      res.status(400).json({ error: result.error || "Failed to transfer envelope funds" });
      return;
    }
    await dbService.flush();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/subscriptions", (req, res) => {
  const { userId } = getAuth(req);
  const subs = dbService.getSubscriptions(userId);
  res.json(subs);
});
apiRouter.post("/subscriptions", async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    const body = req.body || {};
    const sub = dbService.saveSubscription(userId, body);
    await dbService.flush();
    res.status(201).json(sub);
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.put("/subscriptions/:id", async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    const body = req.body || {};
    const sub = dbService.saveSubscription(userId, { ...body, id });
    await dbService.flush();
    res.json(sub);
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.delete("/subscriptions/:id", async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    const ok = dbService.deleteSubscription(userId, id);
    if (!ok) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }
    await dbService.flush();
    res.json({ success: true, message: "Subscription moved to trash" });
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.post("/workspace/clear", async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    dbService.clearWorkspace(userId);
    await dbService.flush();
    res.json({ success: true, message: "All transactions, tasks, bills, and demo data cleared successfully" });
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/study/tiers", (req, res) => {
  const { userId } = getAuth(req);
  const tiers = dbService.getStudyTiers(userId);
  res.json(tiers);
});
apiRouter.post("/study/tiers", async (req, res, next) => {
  const { userId } = getAuth(req);
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const name = parseNonEmptyString(body.name, 128);
  if (!name) {
    res.status(400).json({ error: "Tier name is required (max 128 chars)" });
    return;
  }
  const shortTitle = parseNonEmptyString(body.shortTitle, 64) || name.slice(0, 24);
  const description = parseOptionalString(body.description, 256) || "";
  try {
    const tier = dbService.saveStudyTier(userId, {
      id: parseOptionalString(body.id, 128) || void 0,
      name,
      shortTitle,
      description
    });
    await dbService.flush();
    res.json(tier);
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.delete("/study/tiers/:id", async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    const success = dbService.deleteStudyTier(userId, req.params.id);
    if (!success) {
      res.status(404).json({ error: "Tier not found" });
      return;
    }
    await dbService.flush();
    res.json({ success: true, message: "Tier deleted" });
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.delete("/study/all", async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    dbService.clearStudyData(userId);
    await dbService.flush();
    res.json({ success: true, message: "All study subjects and topics cleared" });
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/study/subjects", (req, res) => {
  const { userId } = getAuth(req);
  const subjects = dbService.getStudySubjects(userId);
  res.json(subjects);
});
apiRouter.post("/study/subjects", async (req, res, next) => {
  const { userId } = getAuth(req);
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const code = parseNonEmptyString(body.code, 64);
  if (!code || !/^[A-Za-z0-9_-]+$/.test(code)) {
    res.status(400).json({ error: "Valid subject code is required (alphanumeric, underscore, hyphen, max 64 chars)" });
    return;
  }
  const name = parseNonEmptyString(body.name, 256);
  if (!name) {
    res.status(400).json({ error: "Subject name is required and must not exceed 256 characters" });
    return;
  }
  const tierId = parseOptionalString(body.tierId, 64) || "custom";
  const semesterOrDomain = parseOptionalString(body.semesterOrDomain, 128) || void 0;
  const targetExam = parseOptionalString(body.targetExam, 128) || void 0;
  const color = parseOptionalString(body.color, 32) || "#3b82f6";
  try {
    const subject = dbService.saveStudySubject(userId, {
      id: parseOptionalString(body.id, 128) || void 0,
      code,
      name,
      tierId,
      semesterOrDomain,
      targetExam,
      color,
      totalSubtopics: parseNonNegativeInt(body.totalSubtopics, 1e4) ?? 0,
      completedSubtopics: parseNonNegativeInt(body.completedSubtopics, 1e4) ?? 0
    });
    await dbService.flush();
    res.json(subject);
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.delete("/study/subjects/:code", async (req, res, next) => {
  const { userId } = getAuth(req);
  try {
    const result = dbService.deleteStudySubject(userId, req.params.code);
    if (!result.success) {
      res.status(404).json({ error: "Subject not found" });
      return;
    }
    await dbService.flush();
    res.json({
      success: true,
      deletedCount: result.deletedCount,
      subjectCode: result.subjectCode,
      message: "Subject and associated topics deleted"
    });
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.post("/study/cleanup-overview-import", async (req, res, next) => {
  const { userId } = getAuth(req);
  try {
    const result = dbService.cleanupOverviewImportData(userId);
    await dbService.flush();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to clean overview data" });
  }
});
apiRouter.post("/study/undo-import-session", async (req, res, next) => {
  const { userId } = getAuth(req);
  const { sessionId, force } = req.body && typeof req.body === "object" ? req.body : {};
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }
  try {
    const result = dbService.undoImportSession(userId, sessionId, Boolean(force));
    await dbService.flush();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to undo import session" });
  }
});
apiRouter.get("/study/topics", (req, res) => {
  const { userId } = getAuth(req);
  const subjectCode = typeof req.query.subjectCode === "string" ? req.query.subjectCode : void 0;
  const topics = dbService.getStudyTopics(userId, subjectCode);
  res.json(topics);
});
apiRouter.post("/study/topics", async (req, res, next) => {
  const { userId } = getAuth(req);
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const topicId = parseOptionalString(body.id, 128) || void 0;
  const existingTopic = topicId ? dbService.getStudyTopics(userId).find((t) => t.id === topicId) : void 0;
  const subjectCode = existingTopic ? existingTopic.subjectCode : parseNonEmptyString(body.subjectCode, 64);
  if (!subjectCode) {
    res.status(400).json({ error: "subjectCode is required" });
    return;
  }
  const unit = body.unit !== void 0 ? parseNonEmptyString(body.unit, 128) : existingTopic?.unit;
  if (!unit) {
    res.status(400).json({ error: "unit is required (max 128 characters)" });
    return;
  }
  const subtopic = body.subtopic !== void 0 ? parseNonEmptyString(body.subtopic, 256) : existingTopic?.subtopic;
  if (!subtopic) {
    res.status(400).json({ error: "subtopic is required (max 256 characters)" });
    return;
  }
  const topic = body.topic !== void 0 ? parseOptionalString(body.topic, 256) || unit : existingTopic?.topic || unit;
  const priority = (body.priority ? parseEnum(body.priority, ALLOWED_STUDY_PRIORITIES) : existingTopic?.priority || "Medium") || "Medium";
  const notes = body.notes !== void 0 ? parseOptionalString(body.notes, 2e3) || "" : existingTopic?.notes;
  const rowIndex = body.rowIndex !== void 0 ? parseNonNegativeInt(body.rowIndex, 1e5) ?? 0 : existingTopic?.rowIndex;
  try {
    const topicRecord = dbService.saveStudyTopic(userId, {
      id: topicId,
      subjectCode,
      unit,
      topic,
      subtopic,
      priority,
      theory: body.theory !== void 0 ? Boolean(body.theory) : existingTopic?.theory,
      practice: body.practice !== void 0 ? Boolean(body.practice) : existingTopic?.practice,
      pyq: body.pyq !== void 0 ? Boolean(body.pyq) : existingTopic?.pyq,
      revisionCount: body.revisionCount !== void 0 ? parseNonNegativeInt(body.revisionCount, 1e3) ?? 0 : existingTopic?.revisionCount,
      notes,
      rowIndex
    });
    await dbService.flush();
    res.json(topicRecord);
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.delete("/study/topics/:id", async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    const success = dbService.deleteStudyTopic(userId, req.params.id);
    if (!success) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }
    await dbService.flush();
    res.json({ success: true, message: "Topic deleted" });
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/study/revisions", (req, res) => {
  const { userId } = getAuth(req);
  const revisions = dbService.getStudyRevisions(userId);
  res.json(revisions);
});
apiRouter.post("/study/revisions", async (req, res, next) => {
  const { userId } = getAuth(req);
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const topicId = parseNonEmptyString(body.topicId, 128);
  if (!topicId) {
    res.status(400).json({ error: "topicId is required" });
    return;
  }
  const subjectCode = parseNonEmptyString(body.subjectCode, 64);
  if (!subjectCode) {
    res.status(400).json({ error: "subjectCode is required" });
    return;
  }
  const topicTitle = parseNonEmptyString(body.topicTitle, 256);
  if (!topicTitle) {
    res.status(400).json({ error: "topicTitle is required" });
    return;
  }
  const lastStudiedAt = parseIsoDate(body.lastStudiedAt) || getTodayDateString(DEFAULT_TIMEZONE);
  const nextRevisionAt = parseIsoDate(body.nextRevisionAt) || lastStudiedAt;
  const difficulty = (body.difficulty ? parseEnum(body.difficulty, ALLOWED_REVISION_DIFFICULTIES) : "medium") || "medium";
  const status = (body.status ? parseEnum(body.status, ALLOWED_REVISION_STATUSES) : "scheduled") || "scheduled";
  const intervalDays = parsePositiveInt(body.intervalDays, 1, 365) || 1;
  const repetition = parseNonNegativeInt(body.repetition, 100) || 0;
  const notes = parseOptionalString(body.notes, 2e3) || void 0;
  try {
    const revision = dbService.saveStudyRevision(userId, {
      id: parseOptionalString(body.id, 128) || void 0,
      topicId,
      subjectCode,
      topicTitle,
      lastStudiedAt,
      nextRevisionAt,
      intervalDays,
      repetition,
      difficulty,
      status,
      notes
    });
    await dbService.flush();
    res.json(revision);
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.post("/study/revisions/:id/recall", async (req, res, next) => {
  const { userId } = getAuth(req);
  const difficulty = req.body.difficulty;
  if (!difficulty || !["easy", "medium", "hard"].includes(difficulty)) {
    res.status(400).json({ error: "Invalid difficulty. Must be easy, medium, or hard" });
    return;
  }
  try {
    const updated = dbService.recordStudyRecall(userId, req.params.id, difficulty);
    if (!updated) {
      res.status(404).json({ error: "Revision not found" });
      return;
    }
    await dbService.flush();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.delete("/study/revisions/:id", async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    const success = dbService.deleteStudyRevision(userId, req.params.id);
    if (!success) {
      res.status(404).json({ error: "Revision not found" });
      return;
    }
    await dbService.flush();
    res.json({ success: true, message: "Revision deleted" });
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/study/mistakes", (req, res) => {
  const { userId } = getAuth(req);
  const mistakes = dbService.getStudyMistakes(userId);
  res.json(mistakes);
});
apiRouter.post("/study/mistakes", async (req, res, next) => {
  const { userId } = getAuth(req);
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const subjectCode = parseNonEmptyString(body.subjectCode, 64);
  if (!subjectCode) {
    res.status(400).json({ error: "subjectCode is required" });
    return;
  }
  const topic = parseNonEmptyString(body.topic, 256);
  if (!topic) {
    res.status(400).json({ error: "topic is required" });
    return;
  }
  const trap = parseNonEmptyString(body.trap, 1024);
  if (!trap) {
    res.status(400).json({ error: "trap (what went wrong) is required" });
    return;
  }
  const goldenRule = parseNonEmptyString(body.goldenRule, 1024);
  if (!goldenRule) {
    res.status(400).json({ error: "goldenRule (corrective takeaway) is required" });
    return;
  }
  const date = parseIsoDate(body.date) || getTodayDateString(DEFAULT_TIMEZONE);
  const severity = (body.severity ? parseEnum(body.severity, ALLOWED_MISTAKE_SEVERITIES) : "Medium") || "Medium";
  const source = parseOptionalString(body.source, 128) || "Mock / PYQ";
  const rootCause = parseOptionalString(body.rootCause, 1024) || "";
  const subjectName = parseOptionalString(body.subjectName, 128) || void 0;
  try {
    const mistake = dbService.saveStudyMistake(userId, {
      id: parseOptionalString(body.id, 128) || void 0,
      date,
      subjectCode,
      subjectName,
      topic,
      source,
      severity,
      trap,
      rootCause,
      goldenRule,
      resolved: Boolean(body.resolved)
    });
    await dbService.flush();
    res.json(mistake);
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.delete("/study/mistakes/:id", async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    const success = dbService.deleteStudyMistake(userId, req.params.id);
    if (!success) {
      res.status(404).json({ error: "Mistake not found" });
      return;
    }
    await dbService.flush();
    res.json({ success: true, message: "Mistake deleted" });
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/audit-logs", (req, res) => {
  const { userId } = getAuth(req);
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 100;
  const logs = dbService.getAuditLogs(userId, limit);
  res.json(logs);
});
apiRouter.get("/sync/queue", (req, res) => {
  const { userId } = getAuth(req);
  const queue = dbService.getSyncQueue(userId);
  res.json(queue);
});
apiRouter.post("/sync/queue/enqueue", async (req, res, next) => {
  const { userId } = getAuth(req);
  const body = req.body || {};
  if (!body.entityType || !body.action || !body.sheetName) {
    res.status(400).json({ error: "entityType, action, and sheetName are required" });
    return;
  }
  try {
    const item = dbService.enqueueSync(userId, body);
    await dbService.flush();
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.post("/sync/queue/:id/status", async (req, res, next) => {
  const { userId } = getAuth(req);
  const { id } = req.params;
  const { status, errorMessage, nextRetryAt, attempts } = req.body || {};
  const updates = {
    status,
    errorMessage,
    nextRetryAt,
    lastAttemptAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (typeof attempts === "number" && Number.isFinite(attempts) && attempts >= 0) {
    updates.attempts = Math.floor(attempts);
  }
  try {
    const item = dbService.updateSyncOp(userId, id, updates);
    if (!item) {
      res.status(404).json({ error: "Queue item not found" });
      return;
    }
    await dbService.flush();
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
function extractGoogleAccessToken(req) {
  const raw = req.headers["x-google-access-token"];
  if (typeof raw === "string" && raw.trim().length > 10) {
    return raw.trim();
  }
  return null;
}
function sendSheetsError(res, err, fallbackMessage, defaultStatus = 502) {
  const message = err instanceof Error ? err.message : fallbackMessage;
  const isAuthError = /\b401\b|UNAUTHENTICATED|invalid authentication credentials|Invalid Credentials/i.test(
    message
  );
  if (isAuthError) {
    res.status(401).json({ error: message, code: "SHEETS_AUTH_REQUIRED" });
    return;
  }
  const isPermissionError = /\b403\b|PERMISSION_DENIED|The caller does not have permission|insufficient authentication scopes/i.test(
    message
  );
  if (isPermissionError) {
    res.status(403).json({ error: message, code: "SHEETS_PERMISSION_DENIED" });
    return;
  }
  res.status(defaultStatus).json({ error: message });
}
apiRouter.post("/sheets/verify", async (req, res) => {
  const accessToken = extractGoogleAccessToken(req);
  if (!accessToken) {
    res.status(401).json({ error: "Google authorization token header is required.", code: "SHEETS_AUTH_REQUIRED" });
    return;
  }
  const spreadsheetId = typeof req.body?.spreadsheetId === "string" ? req.body.spreadsheetId.trim() : "";
  if (!spreadsheetId) {
    res.status(400).json({ error: "spreadsheetId is required." });
    return;
  }
  try {
    const meta = await verifySpreadsheet(spreadsheetId, accessToken);
    res.json({
      spreadsheetId: meta.spreadsheetId,
      title: meta.title,
      sheetsCount: meta.sheets.length
    });
  } catch (err) {
    sendSheetsError(res, err, "Spreadsheet verification failed.", 400);
  }
});
apiRouter.post("/sheets/create-workbook", async (req, res) => {
  const accessToken = extractGoogleAccessToken(req);
  if (!accessToken) {
    res.status(401).json({ error: "Google authorization token header is required.", code: "SHEETS_AUTH_REQUIRED" });
    return;
  }
  try {
    const created = await createMasterWorkbook(accessToken);
    res.status(201).json(created);
  } catch (err) {
    sendSheetsError(res, err, "Workbook creation failed.");
  }
});
apiRouter.post("/sheets/sync", async (req, res) => {
  const accessToken = extractGoogleAccessToken(req);
  if (!accessToken) {
    res.status(401).json({ error: "Google authorization token header is required.", code: "SHEETS_AUTH_REQUIRED" });
    return;
  }
  const spreadsheetId = typeof req.body?.spreadsheetId === "string" ? req.body.spreadsheetId.trim() : "";
  const data = req.body?.data;
  if (!spreadsheetId || !data || typeof data !== "object") {
    res.status(400).json({ error: "spreadsheetId and snapshot data are required." });
    return;
  }
  try {
    const result = await syncAllData(spreadsheetId, accessToken, data);
    res.json({ success: true, ...result });
  } catch (err) {
    sendSheetsError(res, err, "Google Sheets sync failed.");
  }
});
apiRouter.post("/sheets/apply-formatting", async (req, res) => {
  const accessToken = extractGoogleAccessToken(req);
  if (!accessToken) {
    res.status(401).json({ error: "Google authorization token header is required.", code: "SHEETS_AUTH_REQUIRED" });
    return;
  }
  const spreadsheetId = typeof req.body?.spreadsheetId === "string" ? req.body.spreadsheetId.trim() : "";
  if (!spreadsheetId) {
    res.status(400).json({ error: "spreadsheetId is required." });
    return;
  }
  try {
    await applyWorkbookFormatting(spreadsheetId, accessToken, {
      includeHeaders: Boolean(req.body?.includeHeaders),
      includeAutoResize: req.body?.includeAutoResize !== false,
      verifyFirst: true
    });
    res.json({ success: true });
  } catch (err) {
    sendSheetsError(res, err, "Formatting update failed.");
  }
});
apiRouter.post("/sheets/historical-resync", async (req, res) => {
  const accessToken = extractGoogleAccessToken(req);
  if (!accessToken) {
    res.status(401).json({ error: "Google authorization token header is required.", code: "SHEETS_AUTH_REQUIRED" });
    return;
  }
  const spreadsheetId = typeof req.body?.spreadsheetId === "string" ? req.body.spreadsheetId.trim() : "";
  const data = req.body?.data;
  const confirmed = req.body?.confirmed === true;
  if (!confirmed) {
    res.status(400).json({ error: "Explicit user confirmation (confirmed: true) is required for historical resync." });
    return;
  }
  if (!spreadsheetId || !data || typeof data !== "object") {
    res.status(400).json({ error: "spreadsheetId and snapshot data are required." });
    return;
  }
  try {
    const result = await historicalResync(spreadsheetId, accessToken, data, true);
    res.json({ success: true, ...result });
  } catch (err) {
    sendSheetsError(res, err, "Historical resync failed.");
  }
});
apiRouter.post("/sheets/flush-queue", async (req, res) => {
  const { userId } = getAuth(req);
  const accessToken = extractGoogleAccessToken(req);
  if (!accessToken) {
    res.status(401).json({ error: "Google authorization token header is required.", code: "SHEETS_AUTH_REQUIRED" });
    return;
  }
  const spreadsheetId = typeof req.body?.spreadsheetId === "string" ? req.body.spreadsheetId.trim() : "";
  if (!spreadsheetId) {
    res.status(400).json({ error: "spreadsheetId is required." });
    return;
  }
  const incomingOps = Array.isArray(req.body?.operations) ? req.body.operations : dbService.getSyncQueue(userId);
  try {
    const summary = await flushQueueOperations(spreadsheetId, accessToken, incomingOps);
    for (const r of summary.results) {
      dbService.updateSyncOp(userId, r.id, {
        status: r.status,
        attempts: r.attempts,
        nextRetryAt: r.nextRetryAt ?? null,
        errorMessage: r.errorMessage ?? null,
        lastAttemptAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    await dbService.flush();
    res.json(summary);
  } catch (err) {
    sendSheetsError(res, err, "Queue flush failed.");
  }
});
function sendSheetHubError(res, err, fallbackMessage) {
  const sanitized = sanitizeForLogging(
    err instanceof Error ? { message: err.message, stack: err.stack } : { error: err }
  );
  console.error("[SheetHub Error]", JSON.stringify(sanitized));
  if (err instanceof SheetHubWorkerError) {
    res.status(err.status).json({
      error: err.message,
      code: err.code,
      status: err.status,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    return;
  }
  const rawMessage = err instanceof Error ? err.message : fallbackMessage;
  const isAuthError = /\b401\b|UNAUTHENTICATED|invalid authentication credentials|Invalid Credentials/i.test(
    rawMessage
  );
  if (isAuthError) {
    res.status(401).json({
      error: rawMessage,
      code: "SHEETS_AUTH_REQUIRED",
      status: 401,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    return;
  }
  const isPermissionError = /\b403\b|PERMISSION_DENIED|The caller does not have permission|insufficient authentication scopes/i.test(
    rawMessage
  );
  if (isPermissionError) {
    res.status(403).json({
      error: rawMessage,
      code: "SHEETS_PERMISSION_DENIED",
      status: 403,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    return;
  }
  const isNotFound = /\b404\b|not found|inaccessible/i.test(rawMessage);
  if (isNotFound) {
    res.status(404).json({
      error: rawMessage,
      code: "SPREADSHEET_NOT_FOUND",
      status: 404,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    return;
  }
  const isRateLimited = /\b429\b|RESOURCE_EXHAUSTED|rate limit/i.test(rawMessage);
  if (isRateLimited) {
    res.status(429).json({
      error: rawMessage,
      code: "SHEETS_RATE_LIMITED",
      status: 429,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    return;
  }
  const isUpstreamNetwork = /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|socket|getaddrinfo/i.test(rawMessage);
  if (isUpstreamNetwork) {
    res.status(502).json({
      error: `Upstream network communication failed: ${rawMessage}`,
      code: "SHEETS_UPSTREAM_NETWORK_ERROR",
      status: 502,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    return;
  }
  res.status(500).json({
    error: rawMessage,
    code: "INTERNAL_ERROR",
    status: 500,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
}
apiRouter.post("/sheet-hub/inspect", async (req, res) => {
  const publicAccess = req.body?.publicAccess === true;
  const authCtx = getAuth(req);
  const accessToken = extractGoogleAccessToken(req);
  if (!publicAccess) {
    if (!authCtx || authCtx.isGuest) {
      res.status(401).json({
        error: "Signed-in FocusFlow authentication is required for private Google Sheets.",
        code: "AUTH_REQUIRED"
      });
      return;
    }
    if (!accessToken) {
      res.status(401).json({
        error: "Google authorization token header is required.",
        code: "SHEETS_AUTH_REQUIRED"
      });
      return;
    }
  }
  const spreadsheetId = typeof req.body?.spreadsheetId === "string" ? req.body.spreadsheetId.trim() : void 0;
  const spreadsheetUrl = typeof req.body?.spreadsheetUrl === "string" ? req.body.spreadsheetUrl.trim() : void 0;
  const previewRows = typeof req.body?.previewRows === "number" && Number.isFinite(req.body.previewRows) ? req.body.previewRows : void 0;
  if (!spreadsheetId && !spreadsheetUrl) {
    res.status(400).json({
      error: "spreadsheetId or spreadsheetUrl is required.",
      code: "INVALID_SPREADSHEET_ID"
    });
    return;
  }
  try {
    const inspected = publicAccess ? await inspectPublicSpreadsheet({ spreadsheetId, spreadsheetUrl, previewRows }) : await inspectSpreadsheet(
      { spreadsheetId, spreadsheetUrl, previewRows },
      accessToken
    );
    res.json(inspected);
  } catch (err) {
    sendSheetHubError(res, err, "Spreadsheet inspection failed.");
  }
});
apiRouter.post("/sheet-hub/pull", async (req, res) => {
  const publicAccess = req.body?.publicAccess === true;
  const authCtx = getAuth(req);
  const accessToken = extractGoogleAccessToken(req);
  if (!publicAccess) {
    if (!authCtx || authCtx.isGuest) {
      res.status(401).json({
        error: "Signed-in FocusFlow authentication is required for private Google Sheets.",
        code: "AUTH_REQUIRED"
      });
      return;
    }
    if (!accessToken) {
      res.status(401).json({
        error: "Google authorization token header is required.",
        code: "SHEETS_AUTH_REQUIRED"
      });
      return;
    }
  }
  const spreadsheetId = typeof req.body?.spreadsheetId === "string" ? req.body.spreadsheetId.trim() : "";
  const tabs = Array.isArray(req.body?.tabs) ? req.body.tabs : [];
  if (!spreadsheetId || !isValidGoogleSpreadsheetId(spreadsheetId)) {
    res.status(400).json({
      error: "Valid spreadsheetId is required.",
      code: "INVALID_SPREADSHEET_ID"
    });
    return;
  }
  if (tabs.length === 0) {
    res.status(400).json({
      error: "At least one tab selection is required.",
      code: "INVALID_PULL_REQUEST"
    });
    return;
  }
  try {
    const pulled = publicAccess ? await pullPublicSpreadsheetTabs({ spreadsheetId, tabs }) : await pullSpreadsheetTabs({ spreadsheetId, tabs }, accessToken);
    res.json(pulled);
  } catch (err) {
    sendSheetHubError(res, err, "Spreadsheet pull failed.");
  }
});
apiRouter.post("/sheet-hub/push-cells", async (req, res) => {
  const authCtx = getAuth(req);
  if (!authCtx || authCtx.isGuest) {
    res.status(401).json({
      error: "Signed-in FocusFlow authentication is required to sync changes to Google Sheets.",
      code: "AUTH_REQUIRED"
    });
    return;
  }
  const accessToken = extractGoogleAccessToken(req);
  if (!accessToken) {
    res.status(401).json({
      error: "Google Sheets edit authorization token header is required.",
      code: "SHEETS_AUTH_REQUIRED"
    });
    return;
  }
  const spreadsheetId = typeof req.body?.spreadsheetId === "string" ? req.body.spreadsheetId.trim() : "";
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
  if (!spreadsheetId || !isValidGoogleSpreadsheetId(spreadsheetId)) {
    res.status(400).json({
      error: "Valid spreadsheetId is required.",
      code: "INVALID_SPREADSHEET_ID"
    });
    return;
  }
  if (updates.length === 0) {
    res.status(400).json({
      error: "At least one cell update is required.",
      code: "INVALID_PUSH_REQUEST"
    });
    return;
  }
  try {
    const result = await pushSheetHubCellUpdates({ spreadsheetId, updates }, accessToken);
    res.json({ success: true, ...result });
  } catch (err) {
    sendSheetHubError(res, err, "Failed to push cell updates to Google Sheets.");
  }
});
apiRouter.post("/sheet-hub/drive-duplicate", async (req, res) => {
  const authCtx = getAuth(req);
  if (!authCtx || authCtx.isGuest) {
    res.status(401).json({
      error: "Signed-in FocusFlow authentication is required to create a Google Drive duplicate.",
      code: "AUTH_REQUIRED"
    });
    return;
  }
  const accessToken = extractGoogleAccessToken(req);
  if (!accessToken) {
    res.status(401).json({
      error: "Google Drive authorization token header is required.",
      code: "DRIVE_AUTH_REQUIRED"
    });
    return;
  }
  const { sourceSpreadsheetId, title, idempotencyKey, operationId, topics, ownerUid: bodyOwnerUid } = req.body || {};
  if (bodyOwnerUid && typeof bodyOwnerUid === "string" && bodyOwnerUid.trim() !== authCtx.userId) {
    res.status(403).json({
      error: "Security violation: Request body ownerUid does not match authenticated user.",
      code: "FORGED_OWNER_UID"
    });
    return;
  }
  if (!sourceSpreadsheetId || typeof sourceSpreadsheetId !== "string") {
    res.status(400).json({
      error: "sourceSpreadsheetId is required.",
      code: "INVALID_SPREADSHEET_ID"
    });
    return;
  }
  const effectiveOpId = (operationId || idempotencyKey || "").trim();
  try {
    const result = await duplicateGoogleDriveFile(
      {
        sourceSpreadsheetId,
        title,
        operationId: effectiveOpId,
        idempotencyKey: effectiveOpId,
        ownerUid: authCtx.userId,
        topics
      },
      accessToken
    );
    res.json({ success: true, ...result });
  } catch (err) {
    sendSheetHubError(res, err, "Failed to duplicate spreadsheet in Google Drive.");
  }
});
apiRouter.post("/sheet-hub/drive-duplicate/reconcile", async (req, res) => {
  const authCtx = getAuth(req);
  if (!authCtx || authCtx.isGuest) {
    res.status(401).json({
      error: "Signed-in FocusFlow authentication is required.",
      code: "AUTH_REQUIRED"
    });
    return;
  }
  const { operationId, status, driveFileId, nativeSheetId, errorMessage, ownerUid: bodyOwnerUid } = req.body || {};
  if (bodyOwnerUid && typeof bodyOwnerUid === "string" && bodyOwnerUid.trim() !== authCtx.userId) {
    res.status(403).json({
      error: "Security violation: Request body ownerUid does not match authenticated user.",
      code: "FORGED_OWNER_UID"
    });
    return;
  }
  if (!operationId || typeof operationId !== "string") {
    res.status(400).json({
      error: "operationId is required.",
      code: "INVALID_OPERATION_ID"
    });
    return;
  }
  try {
    const record = await defaultIdempotencyLedger.reconcileOperation({
      operationId,
      status: status || "COMPLETED",
      ownerUid: authCtx.userId,
      driveFileId,
      nativeSheetId,
      errorMessage
    });
    res.json({ success: true, record });
  } catch (err) {
    sendSheetHubError(res, err, "Failed to reconcile operation.");
  }
});
apiRouter.post("/sheet-hub/apps-script-writeback", async (req, res) => {
  const authCtx = getAuth(req);
  if (!authCtx || authCtx.isGuest) {
    res.status(401).json({
      error: "Signed-in FocusFlow authentication is required for Apps Script write-back.",
      code: "AUTH_REQUIRED"
    });
    return;
  }
  const { connectionId, spreadsheetId, sheetTitle, rowNumber, colLetter, value, expectedIdentity } = req.body || {};
  if (!connectionId || typeof connectionId !== "string") {
    res.status(400).json({
      error: "connectionId is required.",
      code: "INVALID_CONNECTION_ID"
    });
    return;
  }
  const requestedUserId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
  if (requestedUserId && requestedUserId !== authCtx.userId) {
    res.status(403).json({
      error: "Tenant isolation violation: connection does not belong to the authenticated user.",
      code: "TENANT_ISOLATION_VIOLATION"
    });
    return;
  }
  if (!isSpreadsheetAllowlisted(spreadsheetId)) {
    res.status(403).json({
      error: `Spreadsheet "${spreadsheetId}" is not allowlisted for Apps Script write-back. Only the dedicated test spreadsheet is permitted.`,
      code: "SPREADSHEET_NOT_ALLOWLISTED"
    });
    return;
  }
  try {
    const result = await dispatchAppsScriptWriteback({
      spreadsheetId,
      sheetTitle,
      rowNumber,
      colLetter,
      value,
      expectedIdentity
    });
    res.json(result);
  } catch (err) {
    if (err instanceof AppsScriptBridgeError) {
      res.status(err.status).json({
        error: err.message,
        code: err.code
      });
      return;
    }
    res.status(500).json({
      error: err instanceof Error ? err.message : "Apps Script write-back failed",
      code: "APPS_SCRIPT_ERROR"
    });
  }
});
apiRouter.get("/sheet-hub/sample-semester3", async (_req, res) => {
  try {
    const fs7 = await import("node:fs");
    const path6 = await import("node:path");
    const { parseLocalXlsxFixture: parseLocalXlsxFixture2 } = await Promise.resolve().then(() => (init_localXlsxParser(), localXlsxParser_exports));
    const { detectWorkbookSchema: detectWorkbookSchema2 } = await Promise.resolve().then(() => (init_schemaDetector(), schemaDetector_exports));
    const candidatePaths = [
      path6.resolve(process.cwd(), "test/fixtures/Semester 3 - Syllabus & Topic Tracker.xlsx"),
      path6.resolve(process.cwd(), "Semester 3 - Syllabus & Topic Tracker.xlsx"),
      "/Users/munshimdatif/Downloads/Semester 3 - Syllabus & Topic Tracker.xlsx"
    ];
    const fixturePath = candidatePaths.find((p) => fs7.existsSync(p)) || candidatePaths[0];
    const parsedTabs = parseLocalXlsxFixture2(fixturePath);
    const inspectedWorkbook = detectWorkbookSchema2(parsedTabs);
    const inspectedTabs = inspectedWorkbook.tabs;
    const pullTabs = parsedTabs.map((pt) => {
      const detected = inspectedTabs.find((it) => it.sheetId === pt.sheetId);
      const headerRowIndex = detected?.headerRowIndex || 1;
      const headers = (detected?.columns || []).map((c) => c.headerName);
      const rows = (pt.rows || []).slice(headerRowIndex).map((cellArr, rIdx) => {
        const values = [];
        const formulaColumns = [];
        for (let c = 0; c < cellArr.length; c++) {
          values.push(cellArr[c]?.value ?? null);
          if (cellArr[c]?.formula) formulaColumns.push(c);
        }
        return {
          sheetRowNumber: (detected?.dataStartRow || 2) + rIdx,
          values,
          formulaColumns
        };
      });
      return {
        sheetTitle: pt.sheetTitle,
        sheetId: pt.sheetId,
        range: `'${pt.sheetTitle}'!A1:Z1000`,
        headers,
        headerRowIndex,
        rows,
        totalRows: rows.length
      };
    });
    res.json({
      inspect: {
        spreadsheetId: "sem3-syllabus-sample",
        spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sem3-syllabus-sample/edit",
        title: "Semester 3 - Syllabus & Topic Tracker",
        tabs: inspectedTabs
      },
      pull: {
        spreadsheetId: "sem3-syllabus-sample",
        title: "Semester 3 - Syllabus & Topic Tracker",
        tabs: pullTabs,
        pulledAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({ error: String(err), code: "FIXTURE_LOAD_ERROR" });
  }
});
apiRouter.get("/backup/export", (req, res) => {
  const { userId } = getAuth(req);
  const backup = dbService.exportUserData(userId);
  res.json(backup);
});
apiRouter.post("/backup/restore", async (req, res, next) => {
  const { userId } = getAuth(req);
  const body = req.body;
  const result = dbService.restoreUserData(userId, body);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  try {
    await dbService.flush();
    res.json(result);
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/joint-vaults", (req, res) => {
  const { userId } = getAuth(req);
  const vaults = dbService.getJointVaultsForUser(userId);
  res.json(vaults);
});
apiRouter.post("/joint-vaults", async (req, res) => {
  const auth = getAuth(req);
  const body = req.body || {};
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    res.status(400).json({ error: "Vault name is required" });
    return;
  }
  if (!body.targetPaise || !Number.isInteger(body.targetPaise) || body.targetPaise <= 0) {
    res.status(400).json({ error: "Target amount must be a positive integer in minor units (paise)" });
    return;
  }
  const allowedCurrencies = ["INR", "USD", "EUR", "GBP"];
  const currency = allowedCurrencies.includes(body.currency) ? body.currency : "INR";
  try {
    const vault = dbService.createJointVault(
      {
        name: body.name,
        description: body.description,
        targetPaise: body.targetPaise,
        monthlyTargetPaise: body.monthlyTargetPaise,
        currency,
        targetRatio: body.targetRatio
      },
      { id: auth.userId, email: auth.email, name: auth.name }
    );
    await dbService.flush();
    const summary = dbService.getVaultSummary(vault.id, auth.userId);
    res.status(201).json(summary || vault);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create joint vault";
    res.status(400).json({ error: msg });
  }
});
apiRouter.get("/joint-vaults/:vaultId", (req, res) => {
  const { userId } = getAuth(req);
  const { vaultId } = req.params;
  const summary = dbService.getVaultSummary(vaultId, userId);
  if (!summary) {
    res.status(404).json({ error: "Vault not found or access denied" });
    return;
  }
  res.json(summary);
});
apiRouter.post("/joint-vaults/:vaultId/invitations", async (req, res) => {
  const auth = getAuth(req);
  const { vaultId } = req.params;
  const body = req.body || {};
  const { invitedEmail, id, inviteCode } = body;
  try {
    const invitation = dbService.createVaultInvitation(
      vaultId,
      { id: auth.userId, name: auth.name },
      invitedEmail,
      { id, inviteCode }
    );
    await dbService.flush();
    res.status(201).json(invitation);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create invitation";
    res.status(400).json({ error: msg });
  }
});
apiRouter.post("/joint-vaults/invitations/accept", async (req, res) => {
  const auth = getAuth(req);
  const { inviteCode } = req.body || {};
  if (!inviteCode || typeof inviteCode !== "string") {
    res.status(400).json({ error: "Invite code is required" });
    return;
  }
  try {
    const result = await vaultBackendService.acceptVaultInvitation(inviteCode, {
      id: auth.userId,
      email: auth.email,
      name: auth.name,
      isGuest: auth.isGuest
    });
    if (auth.isGuest) {
      await dbService.flush();
    }
    const summary = await vaultBackendService.getVaultSummary(result.vault.id, auth.userId);
    res.json(summary || result);
  } catch (err) {
    const status = err?.status || 400;
    const code = err?.code || (status === 503 ? "FIREBASE_ADMIN_NOT_CONFIGURED" : "VAULT_ERROR");
    const msg = err instanceof Error ? err.message : "Failed to accept invitation";
    res.status(status).json({ error: msg, code });
  }
});
apiRouter.post("/joint-vaults/invitations/reject", async (req, res) => {
  const auth = getAuth(req);
  const { inviteCode } = req.body || {};
  if (!inviteCode || typeof inviteCode !== "string") {
    res.status(400).json({ error: "Invite code is required" });
    return;
  }
  try {
    const invitation = await vaultBackendService.rejectVaultInvitation(inviteCode, {
      id: auth.userId,
      email: auth.email,
      isGuest: auth.isGuest
    });
    if (auth.isGuest) {
      await dbService.flush();
    }
    res.json(invitation);
  } catch (err) {
    const status = err?.status || 400;
    const code = err?.code || "VAULT_ERROR";
    const msg = err instanceof Error ? err.message : "Failed to reject invitation";
    res.status(status).json({ error: msg, code });
  }
});
apiRouter.post("/joint-vaults/:vaultId/invitations/:inviteId/revoke", async (req, res) => {
  const auth = getAuth(req);
  const { vaultId, inviteId } = req.params;
  try {
    const result = await vaultBackendService.revokeVaultInvitation(vaultId, inviteId, {
      id: auth.userId,
      isGuest: auth.isGuest
    });
    if (auth.isGuest) {
      await dbService.flush();
    }
    res.json(result);
  } catch (err) {
    const status = err?.status || 400;
    const code = err?.code || "VAULT_ERROR";
    const msg = err instanceof Error ? err.message : "Failed to revoke invitation";
    res.status(status).json({ error: msg, code });
  }
});
apiRouter.post("/joint-vaults/:vaultId/contributions", async (req, res) => {
  const auth = getAuth(req);
  const { vaultId } = req.params;
  const body = req.body || {};
  try {
    const contribution = dbService.addVaultContribution(
      vaultId,
      { id: auth.userId, name: auth.name },
      {
        amountPaise: body.amountPaise,
        date: body.date,
        description: body.description
      }
    );
    await dbService.flush();
    const summary = dbService.getVaultSummary(vaultId, auth.userId);
    res.status(201).json({ contribution, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to add contribution";
    res.status(400).json({ error: msg });
  }
});
apiRouter.post("/joint-vaults/:vaultId/contributions/:id/reverse", async (req, res) => {
  const { userId } = getAuth(req);
  const { vaultId, id } = req.params;
  const { reason } = req.body || {};
  try {
    const contribution = dbService.reverseVaultContribution(vaultId, id, userId, reason || "Reversed by member");
    await dbService.flush();
    const summary = dbService.getVaultSummary(vaultId, userId);
    res.json({ contribution, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to reverse contribution";
    res.status(400).json({ error: msg });
  }
});
apiRouter.post("/joint-vaults/:vaultId/expenses", async (req, res) => {
  const auth = getAuth(req);
  const { vaultId } = req.params;
  const body = req.body || {};
  try {
    const expense = dbService.addVaultExpense(
      vaultId,
      { id: auth.userId, name: auth.name },
      {
        amountPaise: body.amountPaise,
        description: body.description,
        date: body.date,
        splitMode: body.splitMode,
        customShares: body.customShares
      }
    );
    await dbService.flush();
    const summary = dbService.getVaultSummary(vaultId, auth.userId);
    res.status(201).json({ expense, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to add joint expense";
    res.status(400).json({ error: msg });
  }
});
apiRouter.post("/joint-vaults/:vaultId/expenses/:id/reverse", async (req, res) => {
  const auth = getAuth(req);
  const { vaultId, id } = req.params;
  const { reason } = req.body || {};
  try {
    const result = await vaultBackendService.reverseVaultExpense(
      vaultId,
      id,
      { id: auth.userId, isGuest: auth.isGuest },
      reason
    );
    if (auth.isGuest) {
      await dbService.flush();
    }
    const summary = await vaultBackendService.getVaultSummary(vaultId, auth.userId);
    res.json({ success: true, ...result, summary });
  } catch (err) {
    const status = err?.status || 400;
    const code = err?.code || "VAULT_ERROR";
    const msg = err instanceof Error ? err.message : "Failed to reverse expense";
    res.status(status).json({ error: msg, code });
  }
});
apiRouter.post("/joint-vaults/:vaultId/settlements", async (req, res) => {
  const auth = getAuth(req);
  const { vaultId } = req.params;
  const body = req.body || {};
  try {
    const settlement = dbService.recordVaultSettlement(
      vaultId,
      { id: auth.userId, name: auth.name },
      {
        toUid: body.toUid,
        toName: body.toName,
        amountPaise: body.amountPaise,
        date: body.date,
        notes: body.notes
      }
    );
    await dbService.flush();
    const summary = dbService.getVaultSummary(vaultId, auth.userId);
    res.status(201).json({ settlement, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to record settlement";
    res.status(400).json({ error: msg });
  }
});
apiRouter.patch("/joint-vaults/:vaultId/ratio", async (req, res) => {
  const { userId } = getAuth(req);
  const { vaultId } = req.params;
  const { targetRatio } = req.body || {};
  try {
    const vault = dbService.updateVaultRatio(vaultId, userId, targetRatio);
    await dbService.flush();
    const summary = dbService.getVaultSummary(vaultId, userId);
    res.json(summary || vault);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update target ratio";
    res.status(400).json({ error: msg });
  }
});
apiRouter.post("/joint-vaults/:vaultId/leave", async (req, res) => {
  const auth = getAuth(req);
  const { vaultId } = req.params;
  try {
    const result = await vaultBackendService.leaveVault(vaultId, {
      id: auth.userId,
      email: auth.email,
      name: auth.name,
      isGuest: auth.isGuest
    });
    if (auth.isGuest) {
      await dbService.flush();
    }
    res.json(result);
  } catch (err) {
    const status = err?.status || (err?.code === "LAST_MEMBER_MUST_ARCHIVE" ? 409 : 400);
    const code = err?.code || (status === 409 ? "LAST_MEMBER_MUST_ARCHIVE" : "VAULT_ERROR");
    const msg = err instanceof Error ? err.message : "Failed to leave vault";
    res.status(status).json({ error: msg, code });
  }
});
apiRouter.post("/joint-vaults/:vaultId/archive", async (req, res) => {
  const auth = getAuth(req);
  const { vaultId } = req.params;
  try {
    const vault = await vaultBackendService.archiveVault(vaultId, {
      id: auth.userId,
      email: auth.email,
      name: auth.name,
      isGuest: auth.isGuest
    });
    if (auth.isGuest) {
      await dbService.flush();
    }
    res.json({ success: true, vault });
  } catch (err) {
    const status = err?.status || 400;
    const code = err?.code || "VAULT_ERROR";
    const msg = err instanceof Error ? err.message : "Failed to archive vault";
    res.status(status).json({ error: msg, code });
  }
});
function requireAuthUser(req, res) {
  const auth = getAuth(req);
  if (!auth || !auth.userId || auth.isGuest) {
    res.status(401).json({
      error: "Signed-in FocusFlow authentication is required for this resource.",
      code: "AUTH_REQUIRED"
    });
    return null;
  }
  return auth;
}
apiRouter.get("/skill-nodes", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const nodes = await v18StorageService.getSkillNodes(auth.userId);
    res.json(nodes);
  } catch {
    res.status(500).json({ error: "Failed to retrieve skill nodes" });
  }
});
apiRouter.get("/skill-nodes/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const node = await v18StorageService.getSkillNode(auth.userId, req.params.id);
    if (!node) {
      res.status(404).json({ error: "Skill node not found", code: "NOT_FOUND" });
      return;
    }
    res.json(node);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Failed to retrieve skill node" });
  }
});
apiRouter.post("/skill-nodes", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  const body = req.body || {};
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 128) : "";
  if (!title) {
    res.status(400).json({ error: "title is required and must be a non-empty string" });
    return;
  }
  const allowedStatuses = ["locked", "available", "in_progress", "completed"];
  const status = allowedStatuses.includes(body.status) ? body.status : "available";
  const tier = typeof body.tier === "number" && body.tier >= 1 && body.tier <= 10 ? Math.floor(body.tier) : 1;
  const xpPoints = typeof body.xpPoints === "number" && body.xpPoints >= 0 ? Math.floor(body.xpPoints) : 10;
  const recordId = typeof body.id === "string" && body.id ? body.id.slice(0, 128) : `sn_${Date.now()}_${crypto8.randomBytes(6).toString("hex")}`;
  const node = {
    id: recordId,
    userId: auth.userId,
    trackId: typeof body.trackId === "string" ? body.trackId.slice(0, 128) : "default",
    title,
    description: typeof body.description === "string" ? body.description.slice(0, 1e3) : "",
    tier,
    prerequisites: Array.isArray(body.prerequisites) ? body.prerequisites.filter((p) => typeof p === "string").slice(0, 20) : [],
    status,
    category: typeof body.category === "string" ? body.category.slice(0, 64) : "General",
    xpPoints,
    completedAt: body.completedAt ? String(body.completedAt) : null,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 2e3) : void 0,
    icon: typeof body.icon === "string" ? body.icon.slice(0, 64) : void 0,
    tags: Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === "string").slice(0, 10) : void 0
  };
  try {
    const saved = await v18StorageService.saveSkillNode(auth.userId, node);
    await dbService.flush();
    res.status(201).json(saved);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.put("/skill-nodes/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const updated = await v18StorageService.updateSkillNode(auth.userId, req.params.id, req.body || {});
    await dbService.flush();
    res.json(updated);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof StorageNotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Failed to update skill node" });
  }
});
apiRouter.delete("/skill-nodes/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const success = await v18StorageService.deleteSkillNode(auth.userId, req.params.id);
    await dbService.flush();
    if (!success) {
      res.status(404).json({ error: "Skill node not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/whiteboard", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const drawings = await v18StorageService.getWhiteboardDrawings(auth.userId);
    res.json(drawings);
  } catch {
    res.status(500).json({ error: "Failed to retrieve whiteboard drawings" });
  }
});
apiRouter.get("/whiteboard/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const drawing = await v18StorageService.getWhiteboardDrawing(auth.userId, req.params.id);
    if (!drawing) {
      res.status(404).json({ error: "Whiteboard drawing not found", code: "NOT_FOUND" });
      return;
    }
    res.json(drawing);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Failed to retrieve whiteboard drawing" });
  }
});
apiRouter.post("/whiteboard", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  const body = req.body || {};
  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl.trim() : "";
  const isDataUrl = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.startsWith("data:image/") && dataUrl.length <= 2 * 1024 * 1024;
  if (!isDataUrl) {
    res.status(400).json({
      error: "Invalid whiteboard dataUrl: must be a valid base64 image data URL under 2MB",
      code: "INVALID_PAYLOAD"
    });
    return;
  }
  const recordId = typeof body.id === "string" && body.id ? body.id.slice(0, 128) : `wb_${Date.now()}_${crypto8.randomBytes(6).toString("hex")}`;
  const drawing = {
    id: recordId,
    userId: auth.userId,
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 128) : "Rough Sketch",
    dataUrl,
    sizeBytes: typeof body.sizeBytes === "number" && body.sizeBytes > 0 ? body.sizeBytes : dataUrl.length,
    width: typeof body.width === "number" && body.width > 0 && body.width <= 4096 ? body.width : 800,
    height: typeof body.height === "number" && body.height > 0 && body.height <= 4096 ? body.height : 600,
    topicId: typeof body.topicId === "string" ? body.topicId.slice(0, 128) : void 0,
    topicTitle: typeof body.topicTitle === "string" ? body.topicTitle.slice(0, 128) : void 0,
    createdAt: typeof body.createdAt === "string" ? body.createdAt : (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  try {
    const saved = await v18StorageService.saveWhiteboardDrawing(auth.userId, drawing);
    await dbService.flush();
    res.status(201).json(saved);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.put("/whiteboard/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const updated = await v18StorageService.updateWhiteboardDrawing(auth.userId, req.params.id, req.body || {});
    await dbService.flush();
    res.json(updated);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof StorageNotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Failed to update whiteboard drawing" });
  }
});
apiRouter.delete("/whiteboard/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const success = await v18StorageService.deleteWhiteboardDrawing(auth.userId, req.params.id);
    await dbService.flush();
    if (!success) {
      res.status(404).json({ error: "Whiteboard drawing not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/exam-simulations", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const sims = await v18StorageService.getExamSimulations(auth.userId);
    res.json(sims);
  } catch {
    res.status(500).json({ error: "Failed to retrieve exam simulations" });
  }
});
apiRouter.get("/exam-simulations/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const sim = await v18StorageService.getExamSimulation(auth.userId, req.params.id);
    if (!sim) {
      res.status(404).json({ error: "Exam simulation not found", code: "NOT_FOUND" });
      return;
    }
    res.json(sim);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Failed to retrieve exam simulation" });
  }
});
apiRouter.post("/exam-simulations", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  const body = req.body || {};
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 128) : "";
  if (!title) {
    res.status(400).json({ error: "title is required and must be a non-empty string" });
    return;
  }
  const totalDurationMinutes = typeof body.totalDurationMinutes === "number" && body.totalDurationMinutes > 0 ? Math.min(body.totalDurationMinutes, 1440) : 180;
  const allowedStatuses = ["idle", "running", "paused", "completed", "in_progress"];
  const status = allowedStatuses.includes(body.status) ? body.status : "idle";
  const recordId = typeof body.id === "string" && body.id ? body.id.slice(0, 128) : `sim_${Date.now()}_${crypto8.randomBytes(6).toString("hex")}`;
  const sim = {
    id: recordId,
    title,
    totalDurationMinutes,
    sections: Array.isArray(body.sections) ? body.sections.slice(0, 20) : [],
    currentSectionIndex: typeof body.currentSectionIndex === "number" ? Math.max(0, body.currentSectionIndex) : 0,
    status,
    sectionElapsedSeconds: typeof body.sectionElapsedSeconds === "object" && body.sectionElapsedSeconds !== null ? body.sectionElapsedSeconds : {},
    totalElapsedSeconds: typeof body.totalElapsedSeconds === "number" ? Math.max(0, body.totalElapsedSeconds) : 0,
    startedAt: typeof body.startedAt === "string" ? body.startedAt : void 0,
    completedAt: typeof body.completedAt === "string" ? body.completedAt : void 0
  };
  try {
    const saved = await v18StorageService.saveExamSimulation(auth.userId, sim);
    await dbService.flush();
    res.status(201).json(saved);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.put("/exam-simulations/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const updated = await v18StorageService.updateExamSimulation(auth.userId, req.params.id, req.body || {});
    await dbService.flush();
    res.json(updated);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof StorageNotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Failed to update exam simulation" });
  }
});
apiRouter.delete("/exam-simulations/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const success = await v18StorageService.deleteExamSimulation(auth.userId, req.params.id);
    await dbService.flush();
    if (!success) {
      res.status(404).json({ error: "Exam simulation not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/decisions", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const decisions = await v18StorageService.getDecisionEntries(auth.userId);
    res.json(decisions);
  } catch {
    res.status(500).json({ error: "Failed to retrieve decision entries" });
  }
});
apiRouter.get("/decisions/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const decision = await v18StorageService.getDecisionEntry(auth.userId, req.params.id);
    if (!decision) {
      res.status(404).json({ error: "Decision entry not found", code: "NOT_FOUND" });
      return;
    }
    res.json(decision);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Failed to retrieve decision entry" });
  }
});
apiRouter.post("/decisions", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  const body = req.body || {};
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 256) : "";
  if (!title) {
    res.status(400).json({ error: "title is required and must be a non-empty string" });
    return;
  }
  const allowedCategories = ["career", "academic", "financial", "personal", "health"];
  const category = allowedCategories.includes(body.category) ? body.category : "personal";
  const confidenceScore = typeof body.confidenceScore === "number" && body.confidenceScore >= 1 && body.confidenceScore <= 10 ? Math.floor(body.confidenceScore) : 5;
  const recordId = typeof body.id === "string" && body.id ? body.id.slice(0, 128) : `dec_${Date.now()}_${crypto8.randomBytes(6).toString("hex")}`;
  const decision = {
    id: recordId,
    userId: auth.userId,
    title,
    category,
    rationale: typeof body.rationale === "string" ? body.rationale.slice(0, 2e3) : "",
    expectedOutcome: typeof body.expectedOutcome === "string" ? body.expectedOutcome.slice(0, 2e3) : "",
    confidenceScore,
    expectedReviewDate: typeof body.expectedReviewDate === "string" ? body.expectedReviewDate.slice(0, 32) : getTodayDateString(DEFAULT_TIMEZONE),
    reviewIntervalDays: typeof body.reviewIntervalDays === "number" ? body.reviewIntervalDays : 30,
    status: body.status === "reviewed" ? "reviewed" : "pending_review",
    actualOutcome: typeof body.actualOutcome === "string" ? body.actualOutcome.slice(0, 2e3) : void 0,
    successRating: typeof body.successRating === "number" ? Math.max(1, Math.min(5, Math.floor(body.successRating))) : void 0,
    reflection: typeof body.reflection === "string" ? body.reflection.slice(0, 2e3) : void 0,
    lessonsLearned: typeof body.lessonsLearned === "string" ? body.lessonsLearned.slice(0, 2e3) : void 0,
    createdAt: typeof body.createdAt === "string" ? body.createdAt : (/* @__PURE__ */ new Date()).toISOString(),
    reviewedAt: typeof body.reviewedAt === "string" ? body.reviewedAt : void 0
  };
  try {
    const saved = await v18StorageService.saveDecisionEntry(auth.userId, decision);
    await dbService.flush();
    res.status(201).json(saved);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.put("/decisions/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const updated = await v18StorageService.updateDecisionEntry(auth.userId, req.params.id, req.body || {});
    await dbService.flush();
    res.json(updated);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof StorageNotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Failed to update decision entry" });
  }
});
apiRouter.delete("/decisions/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const success = await v18StorageService.deleteDecisionEntry(auth.userId, req.params.id);
    await dbService.flush();
    if (!success) {
      res.status(404).json({ error: "Decision entry not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/doomscroll-tax", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const logs = await v18StorageService.getDoomscrollLogs(auth.userId);
    res.json(logs);
  } catch {
    res.status(500).json({ error: "Failed to retrieve doomscroll logs" });
  }
});
apiRouter.get("/doomscroll-tax/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const log = await v18StorageService.getDoomscrollLog(auth.userId, req.params.id);
    if (!log) {
      res.status(404).json({ error: "Doomscroll log not found", code: "NOT_FOUND" });
      return;
    }
    res.json(log);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Failed to retrieve doomscroll log" });
  }
});
apiRouter.post("/doomscroll-tax", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  const body = req.body || {};
  const minutes = typeof body.minutes === "number" && body.minutes > 0 ? Math.floor(body.minutes) : 0;
  if (minutes <= 0) {
    res.status(400).json({ error: "minutes is required and must be a positive number" });
    return;
  }
  const recordId = typeof body.id === "string" && body.id ? body.id.slice(0, 128) : `tax_${Date.now()}_${crypto8.randomBytes(6).toString("hex")}`;
  const log = {
    id: recordId,
    userId: auth.userId,
    minutes,
    durationMinutes: minutes,
    distractionApp: typeof body.distractionApp === "string" ? body.distractionApp.slice(0, 64) : "Social Media",
    platform: typeof body.platform === "string" ? body.platform.slice(0, 64) : void 0,
    ratePerHour: typeof body.ratePerHour === "number" && body.ratePerHour >= 0 ? body.ratePerHour : 0,
    amountTaxed: typeof body.amountTaxed === "number" && body.amountTaxed >= 0 ? body.amountTaxed : 0,
    taxAmountPaise: typeof body.taxAmountPaise === "number" && body.taxAmountPaise >= 0 ? body.taxAmountPaise : void 0,
    currency: typeof body.currency === "string" ? body.currency.slice(0, 8) : "\u20B9",
    notes: typeof body.notes === "string" ? body.notes.slice(0, 500) : void 0,
    reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : void 0,
    linkedSavingsGoalId: typeof body.linkedSavingsGoalId === "string" ? body.linkedSavingsGoalId.slice(0, 128) : void 0,
    createdAt: typeof body.createdAt === "string" ? body.createdAt : (/* @__PURE__ */ new Date()).toISOString()
  };
  try {
    const saved = await v18StorageService.saveDoomscrollLog(auth.userId, log);
    await dbService.flush();
    res.status(201).json(saved);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.put("/doomscroll-tax/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const updated = await v18StorageService.updateDoomscrollLog(auth.userId, req.params.id, req.body || {});
    await dbService.flush();
    res.json(updated);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof StorageNotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Failed to update doomscroll log" });
  }
});
apiRouter.delete("/doomscroll-tax/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const success = await v18StorageService.deleteDoomscrollLog(auth.userId, req.params.id);
    await dbService.flush();
    if (!success) {
      res.status(404).json({ error: "Doomscroll log not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.delete("/doomscroll-tax", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const success = await v18StorageService.clearDoomscrollLogs(auth.userId);
    await dbService.flush();
    res.json({ success });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
function getTrustedServerToday(req) {
  const tz = req.query.tz || req.headers["x-timezone"] || DEFAULT_TIMEZONE;
  return getTodayDateString(tz);
}
function isTimeCapsuleUnlockedOnServer(capsule, serverToday) {
  if (!capsule.unlockDate) return true;
  return capsule.unlockDate <= serverToday;
}
function sanitizeTimeCapsuleForResponse(capsule, serverToday) {
  const isUnlocked = isTimeCapsuleUnlockedOnServer(capsule, serverToday);
  if (isUnlocked) {
    return {
      ...capsule,
      isUnlocked: true,
      isSealed: false,
      openedAt: capsule.openedAt || (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  return {
    id: capsule.id,
    userId: capsule.userId,
    title: capsule.title,
    content: "",
    // Redacted on server! Content never leaves server until unlock date
    unlockDate: capsule.unlockDate,
    isUnlocked: false,
    isSealed: true,
    sealedAt: capsule.sealedAt || capsule.createdAt,
    createdAt: capsule.createdAt,
    tags: capsule.tags
  };
}
apiRouter.get("/time-capsules", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const serverToday = getTrustedServerToday(req);
    const capsules = await v18StorageService.getTimeCapsules(auth.userId);
    const sanitized = capsules.map((c) => sanitizeTimeCapsuleForResponse(c, serverToday));
    res.json(sanitized);
  } catch {
    res.status(500).json({ error: "Failed to retrieve time capsules" });
  }
});
apiRouter.get("/time-capsules/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const serverToday = getTrustedServerToday(req);
    const capsule = await v18StorageService.getTimeCapsule(auth.userId, req.params.id);
    if (!capsule) {
      res.status(404).json({ error: "Time capsule not found", code: "NOT_FOUND" });
      return;
    }
    if (capsule.userId !== auth.userId) {
      res.status(403).json({ error: "Cross-user access forbidden", code: "FORBIDDEN" });
      return;
    }
    res.json(sanitizeTimeCapsuleForResponse(capsule, serverToday));
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Failed to retrieve time capsule" });
  }
});
apiRouter.post("/time-capsules", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  const body = req.body || {};
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 256) : "";
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 2e4) : "";
  const unlockDate = typeof body.unlockDate === "string" ? body.unlockDate.trim().slice(0, 32) : "";
  if (!title || !content || !unlockDate) {
    res.status(400).json({ error: "title, content, and unlockDate are required" });
    return;
  }
  const serverToday = getTrustedServerToday(req);
  const isUnlocked = isTimeCapsuleUnlockedOnServer({ unlockDate }, serverToday);
  const recordId = typeof body.id === "string" && body.id ? body.id.slice(0, 128) : `cap_${Date.now()}_${crypto8.randomBytes(6).toString("hex")}`;
  const capsule = {
    id: recordId,
    userId: auth.userId,
    title,
    content,
    // Stored safely in authoritative database
    unlockDate,
    isUnlocked,
    isSealed: !isUnlocked,
    sealedAt: typeof body.sealedAt === "string" ? body.sealedAt : (/* @__PURE__ */ new Date()).toISOString(),
    createdAt: typeof body.createdAt === "string" ? body.createdAt : (/* @__PURE__ */ new Date()).toISOString(),
    openedAt: isUnlocked ? typeof body.openedAt === "string" ? body.openedAt : (/* @__PURE__ */ new Date()).toISOString() : void 0,
    tags: Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === "string").slice(0, 10) : void 0
  };
  try {
    const saved = await v18StorageService.saveTimeCapsule(auth.userId, capsule);
    await dbService.flush();
    res.status(201).json(sanitizeTimeCapsuleForResponse(saved, serverToday));
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.put("/time-capsules/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const serverToday = getTrustedServerToday(req);
    const existing = await v18StorageService.getTimeCapsule(auth.userId, req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Time capsule not found", code: "NOT_FOUND" });
      return;
    }
    if (existing.userId !== auth.userId) {
      res.status(403).json({ error: "Cross-user write forbidden", code: "FORBIDDEN" });
      return;
    }
    const body = req.body || {};
    const effectiveUnlockDate = typeof body.unlockDate === "string" && body.unlockDate.trim() ? body.unlockDate.trim().slice(0, 32) : existing.unlockDate;
    const isUnlocked = isTimeCapsuleUnlockedOnServer({ unlockDate: effectiveUnlockDate }, serverToday);
    const updates = {
      unlockDate: effectiveUnlockDate,
      isUnlocked,
      isSealed: !isUnlocked
    };
    if (typeof body.title === "string") updates.title = body.title.trim().slice(0, 256);
    if (Array.isArray(body.tags)) updates.tags = body.tags.filter((t) => typeof t === "string").slice(0, 10);
    if (typeof body.content === "string" && body.content.trim()) {
      updates.content = body.content.trim().slice(0, 2e4);
    }
    const updated = await v18StorageService.updateTimeCapsule(auth.userId, req.params.id, updates);
    await dbService.flush();
    res.json(sanitizeTimeCapsuleForResponse(updated, serverToday));
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof StorageNotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Failed to update time capsule" });
  }
});
apiRouter.delete("/time-capsules/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const existing = await v18StorageService.getTimeCapsule(auth.userId, req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Time capsule not found", code: "NOT_FOUND" });
      return;
    }
    if (existing.userId !== auth.userId) {
      res.status(403).json({ error: "Cross-user delete forbidden", code: "FORBIDDEN" });
      return;
    }
    const success = await v18StorageService.deleteTimeCapsule(auth.userId, req.params.id);
    await dbService.flush();
    if (!success) {
      res.status(404).json({ error: "Time capsule not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.get("/life-milestones", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const milestones = await v18StorageService.getLifeMilestones(auth.userId);
    res.json(milestones);
  } catch {
    res.status(500).json({ error: "Failed to retrieve life milestones" });
  }
});
apiRouter.get("/life-milestones/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const milestone = await v18StorageService.getLifeMilestone(auth.userId, req.params.id);
    if (!milestone) {
      res.status(404).json({ error: "Life milestone not found", code: "NOT_FOUND" });
      return;
    }
    res.json(milestone);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Failed to retrieve life milestone" });
  }
});
apiRouter.post("/life-milestones", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  const body = req.body || {};
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 128) : "";
  if (!label) {
    res.status(400).json({ error: "label is required and must be a non-empty string" });
    return;
  }
  const allowedCategories = ["education", "career", "personal", "health", "target"];
  const category = allowedCategories.includes(body.category) ? body.category : "personal";
  const age = typeof body.age === "number" && body.age >= 0 && body.age <= 120 ? Math.floor(body.age) : 25;
  const weekIndex = typeof body.weekIndex === "number" && body.weekIndex >= 0 ? Math.floor(body.weekIndex) : age * 52;
  const recordId = typeof body.id === "string" && body.id ? body.id.slice(0, 128) : `m_${Date.now()}_${crypto8.randomBytes(6).toString("hex")}`;
  const milestone = {
    id: recordId,
    weekIndex,
    age,
    label,
    title: typeof body.title === "string" ? body.title.trim().slice(0, 128) : label,
    category,
    date: typeof body.date === "string" ? body.date.slice(0, 32) : void 0,
    color: typeof body.color === "string" ? body.color.slice(0, 32) : void 0
  };
  try {
    const saved = await v18StorageService.saveLifeMilestone(auth.userId, milestone);
    await dbService.flush();
    res.status(201).json(saved);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.put("/life-milestones/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const updated = await v18StorageService.updateLifeMilestone(auth.userId, req.params.id, req.body || {});
    await dbService.flush();
    res.json(updated);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof StorageNotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Failed to update life milestone" });
  }
});
apiRouter.delete("/life-milestones/:id", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const success = await v18StorageService.deleteLifeMilestone(auth.userId, req.params.id);
    await dbService.flush();
    if (!success) {
      res.status(404).json({ error: "Life milestone not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Database persistence failed" });
  }
});
function sanitizeMaskedAccount(raw, index) {
  const institution = typeof raw?.institution === "string" ? raw.institution.trim().slice(0, 128) : "Financial Institution";
  const nickname = typeof raw?.nickname === "string" ? raw.nickname.trim().slice(0, 128) : "Account";
  const rawNum = typeof raw?.maskedNumber === "string" ? raw.maskedNumber.trim() : typeof raw?.accountNumber === "string" ? raw.accountNumber.trim() : "";
  const digits = rawNum.replace(/\s+/g, "");
  const last4 = digits.length > 4 ? digits.slice(-4) : digits || "\u2022\u2022\u2022\u2022";
  const maskedNumber = last4.startsWith("\u2022\u2022\u2022\u2022") ? last4 : `\u2022\u2022\u2022\u2022 ${last4}`;
  const validTypes = ["Savings", "Checking", "Fixed Deposit", "Demat/Brokerage", "Credit Card"];
  const accountType = validTypes.includes(raw?.accountType) ? raw.accountType : "Savings";
  const nomineeName = typeof raw?.nomineeName === "string" && raw.nomineeName.trim() ? raw.nomineeName.trim().slice(0, 128) : void 0;
  const notes = typeof raw?.notes === "string" && raw.notes.trim() ? raw.notes.trim().slice(0, 500) : void 0;
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id.slice(0, 64) : `acc_${Date.now()}_${index}`,
    institution,
    nickname,
    maskedNumber,
    accountType,
    nomineeName,
    notes
  };
}
function sanitizeInsurancePolicy(raw, index) {
  const provider = typeof raw?.provider === "string" ? raw.provider.trim().slice(0, 128) : "Insurance Provider";
  const rawNum = typeof raw?.policyNumber === "string" ? raw.policyNumber.trim() : typeof raw?.policyRef === "string" ? raw.policyRef.trim() : "";
  const digits = rawNum.replace(/\s+/g, "");
  const last4 = digits.length > 4 ? digits.slice(-4) : digits || "\u2022\u2022\u2022\u2022";
  const policyNumber = last4.startsWith("\u2022\u2022\u2022\u2022") ? last4 : `\u2022\u2022\u2022\u2022 ${last4}`;
  const policyType = typeof raw?.policyType === "string" && raw.policyType.trim() ? raw.policyType.trim().slice(0, 64) : "Health Insurance";
  const coverageAmountPaise = typeof raw?.coverageAmountPaise === "number" && Number.isFinite(raw.coverageAmountPaise) && raw.coverageAmountPaise >= 0 ? Math.min(raw.coverageAmountPaise, 1e11) : 0;
  const emergencyHelpline = typeof raw?.emergencyHelpline === "string" ? raw.emergencyHelpline.trim().slice(0, 64) : "";
  const nomineeName = typeof raw?.nomineeName === "string" ? raw.nomineeName.trim().slice(0, 128) : "";
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id.slice(0, 64) : `pol_${Date.now()}_${index}`,
    provider,
    policyNumber,
    policyType,
    coverageAmountPaise,
    emergencyHelpline,
    nomineeName
  };
}
function sanitizeEmergencyContact(raw, index) {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id.slice(0, 64) : `c_${Date.now()}_${index}`,
    name: typeof raw?.name === "string" ? raw.name.trim().slice(0, 128) : "Contact",
    relationship: typeof raw?.relationship === "string" ? raw.relationship.trim().slice(0, 64) : "Next-of-Kin",
    phone: typeof raw?.phone === "string" ? raw.phone.trim().slice(0, 32) : "",
    email: typeof raw?.email === "string" && raw.email.trim() ? raw.email.trim().slice(0, 128) : void 0,
    isPrimary: Boolean(raw?.isPrimary)
  };
}
apiRouter.get("/emergency-profile", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const profile = await v18StorageService.getEmergencyProfile(auth.userId);
    res.json(
      profile || {
        id: `ep_${auth.userId}`,
        userId: auth.userId,
        accounts: [],
        policies: [],
        emergencyContacts: [],
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    );
  } catch {
    res.status(500).json({ error: "Failed to retrieve emergency profile" });
  }
});
apiRouter.post("/emergency-profile", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  const body = req.body || {};
  const rawAccounts = Array.isArray(body.accounts) ? body.accounts.slice(0, 50) : [];
  const rawPolicies = Array.isArray(body.policies) ? body.policies.slice(0, 50) : [];
  const rawContacts = Array.isArray(body.emergencyContacts) ? body.emergencyContacts.slice(0, 20) : Array.isArray(body.contacts) ? body.contacts.slice(0, 20) : [];
  const sanitizedAccounts = rawAccounts.map(sanitizeMaskedAccount);
  const sanitizedPolicies = rawPolicies.map(sanitizeInsurancePolicy);
  const sanitizedContacts = rawContacts.map(sanitizeEmergencyContact);
  const profile = {
    id: `ep_${auth.userId}`,
    userId: auth.userId,
    fullName: typeof body.fullName === "string" && body.fullName.trim() ? body.fullName.trim().slice(0, 128) : void 0,
    bloodGroup: typeof body.bloodGroup === "string" && body.bloodGroup.trim() ? body.bloodGroup.trim().slice(0, 16) : void 0,
    primaryHospital: typeof body.primaryHospital === "string" && body.primaryHospital.trim() ? body.primaryHospital.trim().slice(0, 256) : void 0,
    accounts: sanitizedAccounts,
    policies: sanitizedPolicies,
    emergencyContacts: sanitizedContacts,
    contacts: sanitizedContacts,
    importantDocumentLocations: typeof body.importantDocumentLocations === "string" && body.importantDocumentLocations.trim() ? body.importantDocumentLocations.trim().slice(0, 2e3) : void 0,
    instructionsNote: typeof body.instructionsNote === "string" && body.instructionsNote.trim() ? body.instructionsNote.trim().slice(0, 2e3) : void 0,
    notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 2e3) : void 0,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  try {
    const saved = await v18StorageService.saveEmergencyProfile(auth.userId, profile);
    await dbService.flush();
    res.status(201).json(saved);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.put("/emergency-profile", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  const body = req.body || {};
  const rawAccounts = Array.isArray(body.accounts) ? body.accounts.slice(0, 50) : [];
  const rawPolicies = Array.isArray(body.policies) ? body.policies.slice(0, 50) : [];
  const rawContacts = Array.isArray(body.emergencyContacts) ? body.emergencyContacts.slice(0, 20) : Array.isArray(body.contacts) ? body.contacts.slice(0, 20) : [];
  const sanitizedAccounts = rawAccounts.map(sanitizeMaskedAccount);
  const sanitizedPolicies = rawPolicies.map(sanitizeInsurancePolicy);
  const sanitizedContacts = rawContacts.map(sanitizeEmergencyContact);
  const profile = {
    id: `ep_${auth.userId}`,
    userId: auth.userId,
    fullName: typeof body.fullName === "string" && body.fullName.trim() ? body.fullName.trim().slice(0, 128) : void 0,
    bloodGroup: typeof body.bloodGroup === "string" && body.bloodGroup.trim() ? body.bloodGroup.trim().slice(0, 16) : void 0,
    primaryHospital: typeof body.primaryHospital === "string" && body.primaryHospital.trim() ? body.primaryHospital.trim().slice(0, 256) : void 0,
    accounts: sanitizedAccounts,
    policies: sanitizedPolicies,
    emergencyContacts: sanitizedContacts,
    contacts: sanitizedContacts,
    importantDocumentLocations: typeof body.importantDocumentLocations === "string" && body.importantDocumentLocations.trim() ? body.importantDocumentLocations.trim().slice(0, 2e3) : void 0,
    instructionsNote: typeof body.instructionsNote === "string" && body.instructionsNote.trim() ? body.instructionsNote.trim().slice(0, 2e3) : void 0,
    notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 2e3) : void 0,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  try {
    const saved = await v18StorageService.saveEmergencyProfile(auth.userId, profile);
    await dbService.flush();
    res.json(saved);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.delete("/emergency-profile", async (req, res) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const success = await v18StorageService.deleteEmergencyProfile(auth.userId);
    await dbService.flush();
    res.json({ success });
  } catch {
    res.status(500).json({ error: "Database persistence failed" });
  }
});
apiRouter.use((_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

// server/serverless.ts
var app = express();
configureTrustProxy(app, process.env.TRUST_PROXY || "true");
app.use(securityHeaders);
app.use(corsHandler);
app.use(express.json({ limit: "5mb" }));
var healthCheck = (_req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    version: "1.8.0",
    platform: "vercel-serverless"
  });
};
app.get("/health", healthCheck);
app.get("/api/health", healthCheck);
app.use("/api", apiRouter);
app.use("/", apiRouter);
app.use(errorHandler);
app.use((_req, res) => {
  res.status(404).json({
    error: "API endpoint not found",
    code: "NOT_FOUND"
  });
});
var serverless_default = app;
export {
  serverless_default as default
};
