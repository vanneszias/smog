import * as FileSystem from "expo-file-system";

const LOG_DIR = `${FileSystem.documentDirectory}logs/`;
const MAX_LOG_FILES = 10;
const MAX_LOG_SIZE = 1024 * 1024;

const ensureLogDirectory = async (): Promise<void> => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(LOG_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(LOG_DIR, { intermediates: true });
    }
  } catch (error) {
    console.error("[logger] Failed to create log directory:", error);
  }
};

const rotateLogFiles = async (): Promise<void> => {
  try {
    const files = await FileSystem.readDirectoryAsync(LOG_DIR);
    if (files.length >= MAX_LOG_FILES) {
      const sortedFiles = files.sort();
      for (let i = 0; i < files.length - MAX_LOG_FILES + 1; i++) {
        await FileSystem.deleteAsync(`${LOG_DIR}${sortedFiles[i]}`, {
          idempotent: true,
        });
      }
    }
  } catch (error) {
    console.error("[logger] Failed to rotate log files:", error);
  }
};

const writeToFile = async (
  level: string,
  messages: unknown[]
): Promise<void> => {
  try {
    await ensureLogDirectory();
    await rotateLogFiles();

    const timestamp = new Date().toISOString();
    const logMessage = messages
      .map((msg) =>
        typeof msg === "object" ? JSON.stringify(msg) : String(msg)
      )
      .join(" ");
    const logLine = `${timestamp} [${level.toUpperCase()}] ${logMessage}\n`;

    const fileName = `smog_${timestamp.split("T")[0]}.log`;
    const filePath = `${LOG_DIR}${fileName}`;

    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (fileInfo.exists && fileInfo.size && fileInfo.size > MAX_LOG_SIZE) {
      await FileSystem.deleteAsync(filePath, { idempotent: true });
    }

    await FileSystem.writeAsStringAsync(filePath, logLine, { appending: true });
  } catch (error) {
    console.error("[logger] Failed to write to log file:", error);
  }
};

const logger = {
  info: (...messages: unknown[]): void => {
    if (__DEV__) {
      console.info(...messages);
    } else {
      writeToFile("info", messages).catch(() => {});
    }
  },
  warn: (...messages: unknown[]): void => {
    if (__DEV__) {
      console.warn(...messages);
    } else {
      writeToFile("warn", messages).catch(() => {});
    }
  },
  error: (...messages: unknown[]): void => {
    if (__DEV__) {
      console.error(...messages);
    } else {
      writeToFile("error", messages).catch(() => {});
    }
  },
  debug: (...messages: unknown[]): void => {
    if (__DEV__) {
      console.debug(...messages);
    } else {
      writeToFile("debug", messages).catch(() => {});
    }
  },
  log: (...messages: unknown[]): void => {
    if (__DEV__) {
      console.log(...messages);
    } else {
      writeToFile("log", messages).catch(() => {});
    }
  },
};

export default logger;
