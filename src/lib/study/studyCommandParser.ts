/**
 * FocusFlow & Finance — Smart Syllabus-to-Task Command Parser
 *
 * Zero-AI, rule-based natural language parser supporting:
 * - English
 * - Bengali (বাংলা)
 * - Banglish (Latin alphabet phonetic Bengali)
 *
 * Extracts: Action intent, Subject keyword, Module/Unit/Chapter number and name,
 * Topic keyword, Target scope, Due date (timezone-aware), Priority, and Estimated duration.
 * Strictly local, offline-capable, and privacy-first (zero external API calls).
 */

import { DEFAULT_TIMEZONE, getZonedDateParts, getTodayDateString, addDays } from '../dateTime.ts';

export type CommandLanguage = 'bn' | 'banglish' | 'en';
export type CommandAction = 'study' | 'complete' | 'review' | 'practice' | 'general';
export type CommandPriority = 'low' | 'medium' | 'high';
export type CommandScope = 'all' | 'specific' | 'pending';
export type DateConfidence = 'exact' | 'relative' | 'ambiguous' | 'none';

export interface ParsedStudyCommand {
  rawText: string;
  normalizedText: string;
  language: CommandLanguage;
  action: CommandAction;
  subjectKeyword?: string;
  unitKeyword?: string;
  unitNumber?: number;
  topicKeyword?: string;
  targetScope: CommandScope;
  dueDate?: string; // YYYY-MM-DD
  dueDateConfidence: DateConfidence;
  dueDateOriginalText?: string;
  priority: CommandPriority;
  estimatedMinutes?: number;
  estimatedPomodoros: number;
}

// Bengali to Arabic numeral map
const BN_TO_ARABIC_DIGIT: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

export function convertBengaliDigits(text: string): string {
  return text.replace(/[০-৯]/g, (ch) => BN_TO_ARABIC_DIGIT[ch] || ch);
}

// Day of week mapping (0: Sunday, 1: Monday, ... 6: Saturday)
const DAY_OF_WEEK_MAP: Record<string, number> = {
  // English
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,

  // Bengali
  রবিবার: 0,
  রবি: 0,
  সোমবার: 1,
  সোম: 1,
  মঙ্গলবার: 2,
  মঙ্গল: 2,
  বুধবার: 3,
  বুধ: 3,
  বৃহস্পতিবার: 4,
  বৃহস্পতি: 4,
  শুক্রবার: 5,
  শুক্র: 5,
  শনিবার: 6,
  শনি: 6,

  // Banglish
  robibar: 0,
  robi: 0,
  shombar: 1,
  sombar: 1,
  shom: 1,
  mongolbar: 2,
  mongol: 2,
  budhbar: 3,
  budh: 3,
  brihoshpotibar: 4,
  brihospotibar: 4,
  brihospoti: 4,
  shukrobar: 5,
  sukrobar: 5,
  shukro: 5,
  shonibar: 6,
  sonibar: 6,
  shoni: 6,
};

/**
 * Detect language of the input command.
 */
export function detectLanguage(text: string): CommandLanguage {
  // Check for Bengali Unicode script range [\u0980-\u09FF]
  if (/[\u0980-\u09FF]/.test(text)) {
    return 'bn';
  }

  const lower = text.toLowerCase();
  const banglishPatterns = [
    /\b(sesh|korte|hobe|korbo|porbo|porte|poro|koro|aaj|aajke|kalke|porshu|agamikal|shombar|shukrobar|budhbar|mongolbar|shonibar|robibar|brihoshpotibar|moddhe|vitore|shoptaho|sob|sobkisu|dorkari|joruri)\b/i,
  ];

  if (banglishPatterns.some((pattern) => pattern.test(lower))) {
    return 'banglish';
  }

  return 'en';
}

/**
 * Calculates the next occurrence of a given target day of week (0-6)
 * relative to the base date.
 */
function getNextDayOfWeekDate(baseDateStr: string, targetDay: number): string {
  const parts = getZonedDateParts(baseDateStr);
  const currentDay = parts.dayOfWeek; // 0-6
  let diff = targetDay - currentDay;
  if (diff <= 0) {
    diff += 7; // Next week's occurrence
  }
  return addDays(baseDateStr, diff);
}

/**
 * Extracts and resolves target due date string (YYYY-MM-DD)
 * using local user timezone.
 */
export function parseDateExpression(
  text: string,
  timezone: string = DEFAULT_TIMEZONE
): {
  date?: string;
  confidence: DateConfidence;
  originalText?: string;
} {
  const todayStr = getTodayDateString(timezone);
  const lower = convertBengaliDigits(text.toLowerCase());

  // 1. Explicit ISO date: YYYY-MM-DD
  const isoMatch = lower.match(/\b(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2];
    const d = isoMatch[3];
    return {
      date: `${y}-${m}-${d}`,
      confidence: 'exact',
      originalText: isoMatch[0],
    };
  }

  // 2. Explicit date: DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = lower.match(/\b(0[1-9]|[12]\d|3[01])[-/.](0[1-9]|1[0-2])[-/.](20\d{2})\b/);
  if (dmyMatch) {
    const d = dmyMatch[1];
    const m = dmyMatch[2];
    const y = dmyMatch[3];
    return {
      date: `${y}-${m}-${d}`,
      confidence: 'exact',
      originalText: dmyMatch[0],
    };
  }

  // 3. Named month expressions (e.g. "Nov 28", "28th November", "28 Nov 2026")
  const monthNames: Record<string, string> = {
    jan: '01', january: '01',
    feb: '02', february: '02',
    mar: '03', march: '03',
    apr: '04', april: '04',
    may: '05',
    jun: '06', june: '06',
    jul: '07', july: '07',
    aug: '08', august: '08',
    sep: '09', sept: '09', september: '09',
    oct: '10', october: '10',
    nov: '11', november: '11',
    dec: '12', december: '12',
  };

  const monthRegex = /\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{1,2})(?:st|nd|rd|th)?)?(?:,?\s+(\d{4}))?\b/i;
  const monthMatch = lower.match(monthRegex);
  if (monthMatch) {
    const day = monthMatch[1] || monthMatch[3];
    const monthKey = monthMatch[2].toLowerCase();
    const month = monthNames[monthKey];
    const currentYear = getZonedDateParts(todayStr).year;
    const year = monthMatch[4] || String(currentYear);
    if (day && month) {
      const paddedDay = day.padStart(2, '0');
      return {
        date: `${year}-${month}-${paddedDay}`,
        confidence: 'exact',
        originalText: monthMatch[0],
      };
    }
  }

  // 4. Relative expressions: Today / আজকে / আজ / aaj / aajke
  if (/\b(today|aaj|aajke)\b/i.test(lower) || /আজকে|আজ/.test(lower)) {
    return {
      date: todayStr,
      confidence: 'relative',
      originalText: 'today',
    };
  }

  // 5. Relative expressions: Tomorrow / কালকে / কাল / আগামীকাল / kalke / agamikal
  if (/\b(tomorrow|kalke|agamikal)\b/i.test(lower) || /আগামীকাল|কালকে|কাল/.test(lower)) {
    return {
      date: addDays(todayStr, 1),
      confidence: 'relative',
      originalText: 'tomorrow',
    };
  }

  // 6. Day after tomorrow / পরশু / porshu
  if (/\b(day after tomorrow|porshu)\b/i.test(lower) || /পরশু/.test(lower)) {
    return {
      date: addDays(todayStr, 2),
      confidence: 'relative',
      originalText: 'day after tomorrow',
    };
  }

  // 7. This week / এই সপ্তাহ / এই সপ্তাহে / ei shoptaho / ei week -> Next Friday / Sunday
  if (/\b(this week|ei shoptaho|ei week)\b/i.test(lower) || /এই\s*সপ্তাহ|এই\s*সপ্তাহে/.test(lower)) {
    // End of current working week (Friday or Sunday)
    const parts = getZonedDateParts(todayStr);
    const daysUntilFriday = (5 - parts.dayOfWeek + 7) % 7 || 7;
    return {
      date: addDays(todayStr, daysUntilFriday),
      confidence: 'relative',
      originalText: 'this week',
    };
  }

  // 8. Next week / আগামী সপ্তাহ / আগামী সপ্তাহে / agami shoptaho
  if (/\b(next week|agami shoptaho)\b/i.test(lower) || /আগামী\s*সপ্তাহ|আগামী\s*সপ্তাহে/.test(lower)) {
    return {
      date: addDays(todayStr, 7),
      confidence: 'relative',
      originalText: 'next week',
    };
  }

  // 9. In N days / N দিনের মধ্যে / N din er moddhe
  const inDaysMatch = lower.match(/\b(?:in\s+)?(\d+)\s*(?:days?|দিনের\s*মধ্যে|din\s*er\s*moddhe)\b/i);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10);
    if (!isNaN(days) && days >= 0 && days <= 365) {
      return {
        date: addDays(todayStr, days),
        confidence: 'relative',
        originalText: inDaysMatch[0],
      };
    }
  }

  // 10. By / On specific day of week (e.g., "by Friday", "আগামী সোমবারের মধ্যে", "agami shombar er moddhe")
  for (const [dayName, targetDayNum] of Object.entries(DAY_OF_WEEK_MAP)) {
    const dayRegex = new RegExp(
      `(?:(?:by|on|আগামী|agami|next)\\s+)?${dayName}(?:(?:ের|er)?\\s*(?:মধ্যে|moddhe|vitore))?`,
      'i'
    );
    if (dayRegex.test(lower)) {
      const targetDate = getNextDayOfWeekDate(todayStr, targetDayNum);
      return {
        date: targetDate,
        confidence: 'relative',
        originalText: dayName,
      };
    }
  }

  return {
    confidence: 'none',
  };
}

/**
 * Extracts Priority from text.
 */
export function parsePriority(text: string): CommandPriority {
  const lower = text.toLowerCase();

  // High priority markers
  if (
    /\b(high|urgent|asap|priority\s*high|high\s*priority|joruri|khub\s*dorkari)\b/i.test(lower) ||
    /জরুরি|জরুরী|খুব\s*দরকারি|উচ্চ/i.test(lower)
  ) {
    return 'high';
  }

  // Low priority markers
  if (
    /\b(low|minor|optional|low\s*priority|priority\s*low|kom\s*dorkari)\b/i.test(lower) ||
    /কম\s*দরকারি|কম|ঐচ্ছিক|সাধারণ/i.test(lower)
  ) {
    return 'low';
  }

  return 'medium';
}

/**
 * Extracts action intent from text.
 */
export function parseAction(text: string): CommandAction {
  const lower = text.toLowerCase();

  if (/\b(practice|solve)\b/i.test(lower) || /প্র্যাকটিস|সলভ/i.test(lower)) {
    return 'practice';
  }
  if (/\b(review|revise|revision)\b/i.test(lower) || /রিভিশন|রিভাইস/i.test(lower)) {
    return 'review';
  }
  if (/\b(complete|finish|done|sesh|khatam)\b/i.test(lower) || /শেষ|কমপ্লিট/i.test(lower)) {
    return 'complete';
  }
  if (
    /\b(study|read|learn|porte|porbo)\b/i.test(lower) ||
    /পড়া|পড়া|পড়ব|পড়ব|পড়তে|পড়তে|পড়ো|পড়ো/i.test(lower)
  ) {
    return 'study';
  }

  return 'general';
}

/**
 * Extracts estimated study time in minutes and pomodoros.
 */
export function parseDuration(text: string): {
  minutes?: number;
  pomodoros: number;
} {
  const converted = convertBengaliDigits(text.toLowerCase());

  // Hours: e.g. "2 hours", "1.5 hr", "২ ঘণ্টা", "2 ghonta"
  const hrMatch = converted.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h|ঘণ্টা|ঘন্টা|ghonta)\b/i);
  if (hrMatch) {
    const hrs = parseFloat(hrMatch[1]);
    if (!isNaN(hrs) && hrs > 0) {
      const minutes = Math.round(hrs * 60);
      return {
        minutes,
        pomodoros: Math.max(1, Math.round(minutes / 25)),
      };
    }
  }

  // Minutes: e.g. "45 mins", "30 minutes", "৩০ মিনিট", "45 minute"
  const minMatch = converted.match(/(\d+)\s*(?:minutes?|mins?|m|মিনিট|minute)\b/i);
  if (minMatch) {
    const mins = parseInt(minMatch[1], 10);
    if (!isNaN(mins) && mins > 0) {
      return {
        minutes: mins,
        pomodoros: Math.max(1, Math.round(mins / 25)),
      };
    }
  }

  // Direct Pomodoro count: e.g. "3 pomodoros"
  const pomoMatch = converted.match(/(\d+)\s*pomodoros?\b/i);
  if (pomoMatch) {
    const p = parseInt(pomoMatch[1], 10);
    if (!isNaN(p) && p > 0) {
      return {
        minutes: p * 25,
        pomodoros: Math.min(100, p),
      };
    }
  }

  // Default: 1 pomodoro (25 minutes)
  return {
    pomodoros: 1,
  };
}

/**
 * Extracts Module / Unit / Chapter designators from text.
 */
export function parseUnitOrModule(text: string): {
  unitKeyword?: string;
  unitNumber?: number;
} {
  const converted = convertBengaliDigits(text);

  // Pattern 1: Unit 2, Module 1, Chapter 3, Ch 2, Mod 1, Part 3
  const p1 = converted.match(
    /\b(unit|module|chapter|mod|ch|part|section|sec)\s*[-:]?\s*(\d+)\b/i
  );
  if (p1) {
    const rawWord = p1[1].toLowerCase();
    const num = parseInt(p1[2], 10);
    const label =
      rawWord.startsWith('mod')
        ? 'Module'
        : rawWord.startsWith('ch')
        ? 'Chapter'
        : rawWord.startsWith('part')
        ? 'Part'
        : rawWord.startsWith('sec')
        ? 'Section'
        : 'Unit';
    return {
      unitKeyword: `${label} ${num}`,
      unitNumber: num,
    };
  }

  // Pattern 2: Bengali অধ্যায় ২, ইউনিট ১, মডিউল ৪, চ্যাপ্টার ৩
  const pBengali = converted.match(
    /(ইউনিট|মডিউল|অধ্যায়|অধ্যায়|চ্যাপ্টার|পার্ট)\s*[-:]?\s*(\d+)/i
  );
  if (pBengali) {
    const rawWord = pBengali[1];
    const num = parseInt(pBengali[2], 10);
    const label =
      rawWord.includes('মডিউল')
        ? 'Module'
        : rawWord.includes('অধ্যায়') || rawWord.includes('অধ্যায়') || rawWord.includes('চ্যাপ্টার')
        ? 'Chapter'
        : rawWord.includes('পার্ট')
        ? 'Part'
        : 'Unit';
    return {
      unitKeyword: `${label} ${num}`,
      unitNumber: num,
    };
  }

  // Pattern 3: 2nd Unit, 1 no Module
  const p2 = converted.match(
    /\b(\d+)\s*(?:no|number|নং)?\s*(unit|module|chapter|mod|ch|part)\b/i
  );
  if (p2) {
    const num = parseInt(p2[1], 10);
    const rawWord = p2[2].toLowerCase();
    const label = rawWord.startsWith('mod') ? 'Module' : rawWord.startsWith('ch') ? 'Chapter' : 'Unit';
    return {
      unitKeyword: `${label} ${num}`,
      unitNumber: num,
    };
  }

  return {};
}

/**
 * Extracts target scope: 'all' (সব/সকল/all), 'pending' (বাকি/pending), or 'specific'.
 */
export function parseTargetScope(text: string): CommandScope {
  const lower = text.toLowerCase();
  if (
    /\b(all|everything|sob|shob|sobkisu)\b/i.test(lower) ||
    /সব|সকল|সমগ্র/i.test(lower)
  ) {
    return 'all';
  }
  if (
    /\b(pending|incomplete|remaining|baki|baki-thaka)\b/i.test(lower) ||
    /বাকি|অসম্পূর্ণ/i.test(lower)
  ) {
    return 'pending';
  }
  return 'specific';
}

/**
 * Common stop words and command syntax to filter out when extracting subject/topic keywords.
 */
const STOP_WORDS_SET = new Set([
  // English
  'complete', 'study', 'finish', 'review', 'read', 'solve', 'practice', 'all', 'pending',
  'by', 'on', 'at', 'in', 'to', 'for', 'with', 'and', 'the', 'a', 'an', 'this', 'next',
  'week', 'today', 'tomorrow', 'friday', 'monday', 'tuesday', 'wednesday', 'thursday',
  'saturday', 'sunday', 'priority', 'high', 'medium', 'low', 'urgent', 'asap',
  'unit', 'module', 'chapter', 'topic', 'topics', 'subtopic', 'subtopics',

  // Bengali
  'শেষ', 'করতে', 'হবে', 'করব', 'পড়তে', 'পড়তে', 'পড়ব', 'পড়ব', 'রিভিশন', 'দিতে', 'সকল',
  'সব', 'বাকি', 'আগামী', 'এই', 'সপ্তাহে', 'সপ্তাহের', 'মধ্যে', 'পর্যন্ত', 'আজকে', 'আজ',
  'কালকে', 'কাল', 'আগামীকাল', 'পরশু', 'সোমবারের', 'মঙ্গলবারের', 'বুধবারের', 'বৃহস্পতিবারের',
  'শুক্রবার', 'শুক্রবারের', 'শনিবারের', 'রবিবারের', 'ইউনিট', 'মডিউল', 'অধ্যায়', 'টপিক',
  'টপিকস', 'এর', 'কে', 'জরুরি', 'উচ্চ',

  // Banglish
  'sesh', 'korte', 'hobe', 'korbo', 'porte', 'porbo', 'revision', 'dite', 'shob', 'sob',
  'baki', 'agami', 'ei', 'shoptaho', 'shoptaho-er', 'moddhe', 'vitore', 'aaj', 'aajke',
  'kalke', 'agamikal', 'porshu', 'shombar', 'shukrobar', 'er', 'koro', 'hobe',
]);

/**
 * Extracts potential Subject and Topic candidate keywords from remaining text.
 */
export function extractSubjectAndTopicKeywords(
  text: string,
  detectedUnitNumber?: number
): {
  subjectKeyword?: string;
  topicKeyword?: string;
} {
  const converted = convertBengaliDigits(text);
  // Remove unit phrases like "Unit 2", "Module 1", "Chapter 3", "অধ্যায় ১"
  let cleaned = converted.replace(
    /\b(?:unit|module|chapter|mod|ch|part|section|sec|ইউনিট|মডিউল|অধ্যায়|চ্যাপ্টার|পার্ট)\s*[-:]?\s*\d+\b/gi,
    ' '
  );

  // Remove date expressions
  cleaned = cleaned.replace(
    /\b(?:today|tomorrow|yesterday|this\s*week|next\s*week|আজকে|আজ|আগামীকাল|কালকে|কাল|পরশু|aaj|aajke|kalke|agamikal|porshu)\b/gi,
    ' '
  );
  cleaned = cleaned.replace(
    /\b(?:by|on|আগামী|agami|next)?\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|সোম(?:বার)?|মঙ্গল(?:বার)?|বুধ(?:বার)?|বৃহস্পতি(?:বার)?|শুক্র(?:বার)?|শনি(?:বার)?|রবি(?:বার)?|shombar|mongolbar|budhbar|brihoshpotibar|shukrobar|shonibar|robibar)(?:(?:ের|er)?\s*(?:মধ্যে|moddhe|vitore))?\b/gi,
    ' '
  );

  // Tokenize
  const tokens = cleaned
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?'"॥।]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_WORDS_SET.has(t.toLowerCase()) && !/^\d+$/.test(t));

  if (tokens.length === 0) {
    return {};
  }

  // Heuristic: First token is often the Subject (e.g. "Math", "Physics", "DBMS", "DSA")
  // Subsequent tokens are often the Topic (e.g. "Algebra", "Deadlock", "Tree", "Pumping Lemma")
  const subjectCandidate = tokens[0];
  const topicCandidate = tokens.slice(1).join(' ') || undefined;

  return {
    subjectKeyword: subjectCandidate,
    topicKeyword: topicCandidate,
  };
}

/**
 * Master parse function: parses natural language study goal input into
 * a structured ParsedStudyCommand object.
 */
export function parseStudyCommand(
  rawInput: string,
  timezone: string = DEFAULT_TIMEZONE
): ParsedStudyCommand {
  const rawText = (rawInput || '').trim();
  const normalizedText = convertBengaliDigits(rawText);
  const language = detectLanguage(rawText);
  const action = parseAction(rawText);
  const targetScope = parseTargetScope(rawText);
  const priority = parsePriority(rawText);
  const { minutes: estimatedMinutes, pomodoros: estimatedPomodoros } = parseDuration(rawText);
  const { date: dueDate, confidence: dueDateConfidence, originalText: dueDateOriginalText } =
    parseDateExpression(rawText, timezone);
  const { unitKeyword, unitNumber } = parseUnitOrModule(rawText);
  const { subjectKeyword, topicKeyword } = extractSubjectAndTopicKeywords(rawText, unitNumber);

  return {
    rawText,
    normalizedText,
    language,
    action,
    subjectKeyword,
    unitKeyword,
    unitNumber,
    topicKeyword,
    targetScope,
    dueDate,
    dueDateConfidence,
    dueDateOriginalText,
    priority,
    estimatedMinutes,
    estimatedPomodoros,
  };
}
