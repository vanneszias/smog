import type React from "react";
import { createContext, useCallback, useEffect, useRef, useState } from "react";
import logger from "@/utils/logger";

type LogEntry = {
  id: string;
  message: string;
};

type LogContextType = {
  logs: LogEntry[];
  clearLogs: () => void;
  exportLogs: () => string;
};

export const LogContext = createContext<LogContextType>({
  logs: [],
  clearLogs: () => {
    /* noop */
  },
  exportLogs: () => "",
});

const MAX_LOGS = 2000;

function generateLogId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export const LogProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsRef = useRef<LogEntry[]>([]);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      const msg = args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" ");
      const entry: LogEntry = { id: generateLogId(), message: msg };
      logsRef.current = [entry, ...logsRef.current].slice(0, MAX_LOGS);

      // Defer state update to prevent setState during render
      setTimeout(() => {
        setLogs([...logsRef.current]);
      }, 0);

      originalLog(...args);
    };
    return () => {
      console.log = originalLog;
    };
  }, []);

  const clearLogs = useCallback(() => {
    logger.debug("[LogProvider] Clearing all logs");
    logsRef.current = [];
    setLogs([]);
  }, []);

  const exportLogs = useCallback(() => {
    const logText = logsRef.current.map((l) => l.message).join("\n");
    logger.debug(`[LogProvider] Exporting ${logsRef.current.length} logs`);
    return logText;
  }, []);

  return (
    <LogContext.Provider value={{ logs, clearLogs, exportLogs }}>
      {children}
    </LogContext.Provider>
  );
};
