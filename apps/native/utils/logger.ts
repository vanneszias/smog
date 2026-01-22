import { Directory, File, Paths } from "expo-file-system";

export type LogLevel = "log" | "info" | "warn" | "error" | "debug";

export type LogRecord = {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: string; // ISO string
  formatted: string;
};

type LogSubscriber = (record: LogRecord) => void;

const LOG_DIR = new Directory(Paths.document, "logs");
const MAX_LOG_FILES = 10;
const MAX_LOG_SIZE = 1024 * 1024; // 1 MB per file
const IN_MEMORY_LOG_LIMIT = 5000;

const recentLogs: LogRecord[] = [];
const subscribers = new Set<LogSubscriber>();
const textEncoder =
  typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

let consolePatched = false;
let logCounter = 0;

const levelToConsoleMethod: Record<LogLevel, keyof typeof originalConsole> = {
  log: "log",
  info: "info",
  warn: "warn",
  error: "error",
  debug: "debug",
};

const formatMessages = (messages: unknown[]): string =>
  messages
    .map((msg) => {
      if (typeof msg === "string") {
        return msg;
      }
      try {
        return JSON.stringify(msg);
      } catch (_error) {
        return String(msg);
      }
    })
    .join(" ");

const createLogRecord = (level: LogLevel, messages: unknown[]): LogRecord => {
  const timestamp = new Date().toISOString();
  const message = formatMessages(messages);
  const formatted = `${timestamp} [${level.toUpperCase()}] ${message}`;
  return {
    id: `${timestamp}-${logCounter++}`,
    level,
    message,
    timestamp,
    formatted,
  };
};

const notifySubscribers = (record: LogRecord): void => {
  recentLogs.unshift(record);
  if (recentLogs.length > IN_MEMORY_LOG_LIMIT) {
    recentLogs.pop();
  }

  subscribers.forEach((subscriber) => {
    try {
      subscriber(record);
    } catch (error) {
      originalConsole.error("[logger] Subscriber error", error);
    }
  });
};

const ensureLogDirectory = (): boolean => {
  try {
    LOG_DIR.create({ intermediates: true, idempotent: true });
    return true;
  } catch (error) {
    originalConsole.error("[logger] Failed to create log directory:", error);
    return false;
  }
};

const rotateLogFiles = (): void => {
  try {
    const entries = LOG_DIR.list().filter(
      (entry): entry is File => entry instanceof File
    );
    if (entries.length >= MAX_LOG_FILES) {
      const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));
      const filesToDelete = sorted.slice(0, entries.length - MAX_LOG_FILES + 1);
      for (const file of filesToDelete) {
        file.delete();
      }
    }
  } catch (error) {
    originalConsole.error("[logger] Failed to rotate log files:", error);
  }
};

const writeLogToDisk = (record: LogRecord): void => {
  if (!textEncoder) {
    return;
  }

  if (!ensureLogDirectory()) {
    return;
  }

  rotateLogFiles();

  try {
    const fileName = `smog_${record.timestamp.split("T")[0]}.log`;
    const logFile = new File(LOG_DIR, fileName);

    if (logFile.size > MAX_LOG_SIZE) {
      logFile.delete();
    }

    if (!logFile.exists) {
      logFile.create({ intermediates: true });
    }

    const handle = logFile.open();
    handle.offset = logFile.size ?? 0;
    handle.writeBytes(textEncoder.encode(`${record.formatted}\n`));
    handle.close();
  } catch (error) {
    originalConsole.error("[logger] Failed to write to log file:", error);
  }
};

const processLog = (level: LogLevel, messages: unknown[]): void => {
  const record = createLogRecord(level, messages);
  notifySubscribers(record);

  const consoleMethod = levelToConsoleMethod[level];
  originalConsole[consoleMethod](...messages);

  if (!__DEV__) {
    writeLogToDisk(record);
  }
};

const patchConsole = (): void => {
  if (consolePatched) {
    return;
  }

  console.log = (...args: unknown[]) => {
    processLog("log", args);
  };

  console.info = (...args: unknown[]) => {
    processLog("info", args);
  };

  console.warn = (...args: unknown[]) => {
    processLog("warn", args);
  };

  console.error = (...args: unknown[]) => {
    processLog("error", args);
  };

  console.debug = (...args: unknown[]) => {
    processLog("debug", args);
  };

  consolePatched = true;
};

patchConsole();

const logger = {
  log: (...messages: unknown[]): void => {
    processLog("log", messages);
  },
  info: (...messages: unknown[]): void => {
    processLog("info", messages);
  },
  warn: (...messages: unknown[]): void => {
    processLog("warn", messages);
  },
  error: (...messages: unknown[]): void => {
    processLog("error", messages);
  },
  debug: (...messages: unknown[]): void => {
    processLog("debug", messages);
  },
};

export const subscribeToLogs = (listener: LogSubscriber): (() => void) => {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
};

export const getRecentLogs = (): LogRecord[] => [...recentLogs];

export const clearRecentLogs = (): void => {
  recentLogs.length = 0;
};

export default logger;
