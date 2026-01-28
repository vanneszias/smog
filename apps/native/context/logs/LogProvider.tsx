import type React from "react";
import { createContext, useCallback, useEffect, useRef, useState } from "react";
import logger, {
  clearRecentLogs,
  getRecentLogs,
  type LogRecord,
  subscribeToLogs,
} from "@/utils/logger";

interface LogContextType {
  logs: LogRecord[];
  clearLogs: () => void;
  exportLogs: () => string;
}

export const LogContext = createContext<LogContextType>({
  logs: [],
  clearLogs: () => {
    /* noop */
  },
  exportLogs: () => "",
});

const MAX_LOGS = 2000;

export const LogProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const initialLogs = getRecentLogs().slice(0, MAX_LOGS);
  const [logs, setLogs] = useState<LogRecord[]>(initialLogs);
  const logsRef = useRef<LogRecord[]>(initialLogs);

  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  useEffect(() => {
    const unsubscribe = subscribeToLogs((record) => {
      logsRef.current = [record, ...logsRef.current].slice(0, MAX_LOGS);
      setLogs(logsRef.current);
    });

    return unsubscribe;
  }, []);

  const clearLogs = useCallback(() => {
    clearRecentLogs();
    logsRef.current = [];
    setLogs([]);
    logger.debug("[LogProvider] Logs cleared by user");
  }, []);

  const exportLogs = useCallback(() => {
    const logText = logsRef.current.map((l) => l.formatted).join("\n");
    logger.debug(`[LogProvider] Exporting ${logsRef.current.length} logs`);
    return logText;
  }, []);

  return (
    <LogContext.Provider value={{ logs, clearLogs, exportLogs }}>
      {children}
    </LogContext.Provider>
  );
};
