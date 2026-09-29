import { Directory, File, Paths } from "expo-file-system";

type LogLevel = "log" | "info" | "warn" | "error" | "debug";

export interface LogRecord {
  formatted: string;
  id: string;
  level: LogLevel;
  message: string;
  timestamp: string; // ISO string
}

type LogSubscriber = (record: LogRecord) => void;

const LOG_DIR = new Directory(Paths.document, "logs");
const MAX_LOG_FILES = 10;
const MAX_LOG_SIZE = 1024 * 1024; // 1 MB per file
const IN_MEMORY_LOG_LIMIT = 5000;

const recentLogs: LogRecord[] = [];
const subscribers = new Set<LogSubscriber>();
const textEncoder =
  typeof TextEncoder === "undefined" ? null : new TextEncoder();

const originalConsole = {
  debug: console.debug.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  log: console.log.bind(console),
  warn: console.warn.bind(console),
};

let consolePatched = false;
let logCounter = 0;

const levelToConsoleMethod: Record<LogLevel, keyof typeof originalConsole> = {
  debug: "debug",
  error: "error",
  info: "info",
  log: "log",
  warn: "warn",
};

const formatMessages = (messages: unknown[]): string =>
  messages
    .map((msg) => {
      if (typeof msg === "string") {
        return msg;
      }
      try {
        return JSON.stringify(msg);
      } catch {
        return String(msg);
      }
    })
    .join(" ");

const createLogRecord = (level: LogLevel, messages: unknown[]): LogRecord => {
  const timestamp = new Date().toISOString();
  const message = formatMessages(messages);
  const formatted = `${timestamp} [${level.toUpperCase()}] ${message}`;
  return {
    formatted,
    id: `${timestamp}-${logCounter++}`,
    level,
    message,
    timestamp,
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
    LOG_DIR.create({ idempotent: true, intermediates: true });
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
  debug: (...messages: unknown[]): void => {
    processLog("debug", messages);
  },
  error: (...messages: unknown[]): void => {
    processLog("error", messages);
  },
  info: (...messages: unknown[]): void => {
    processLog("info", messages);
  },
  log: (...messages: unknown[]): void => {
    processLog("log", messages);
  },
  warn: (...messages: unknown[]): void => {
    processLog("warn", messages);
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

const sanitizeTimestamp = (timestamp: string): string =>
  timestamp.replace(/[:.]/g, "-");

const writeStringToHandle = (
  handle: ReturnType<File["open"]>,
  content: string
): void => {
  if (!textEncoder) {
    return;
  }
  handle.writeBytes(textEncoder.encode(content));
};

export const exportLogsToFile = async (): Promise<File> => {
  if (!textEncoder) {
    throw new Error("Text encoder unavailable - cannot export logs.");
  }

  const timestamp = sanitizeTimestamp(new Date().toISOString());
  const exportFileName = `smog_logs_${timestamp}.log`;
  const exportFile = new File(Paths.document, exportFileName);

  if (exportFile.exists) {
    exportFile.delete();
  }

  exportFile.create({ intermediates: true, overwrite: true });

  const handle = exportFile.open();

  try {
    const header = `Smog logs export - generated ${new Date().toISOString()}\n========================================\n`;
    writeStringToHandle(handle, header);

    const activeLogs = [...recentLogs].reverse();
    if (activeLogs.length) {
      writeStringToHandle(handle, "\n[Recent Session]\n");
      writeStringToHandle(
        handle,
        `${activeLogs.map((record) => record.formatted).join("\n")}\n`
      );
    }

    if (ensureLogDirectory()) {
      const files = LOG_DIR.list().filter(
        (entry): entry is File => entry instanceof File
      );
      const sortedFiles = files.sort((a, b) => a.name.localeCompare(b.name));

      for (const file of sortedFiles) {
        writeStringToHandle(handle, `\n[Archived] ${file.name}\n`);
        // biome-ignore lint/performance/noAwaitInLoops: archived logs must be appended to the export handle in sorted order
        const contents = await file.text();
        writeStringToHandle(handle, `${contents}\n`);
      }
    }

    return exportFile;
  } catch (error) {
    exportFile.delete();
    throw error;
  } finally {
    handle.close();
  }
};

export default logger;
