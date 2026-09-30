import { useRpcClient } from "@smog/rpc/react";
import { useCallback, useState } from "react";
import type { AccountExport } from "../schema";
import type { AccountSlice } from "./import-guest-data";

export type ExportStatus = "idle" | "exporting" | "error";

export interface Export {
  /**
   * Fetches the export (`account.export`); the app saves it (web: a file
   * download, mobile: the share sheet). Rejects if the call fails.
   */
  exportAccount: () => Promise<AccountExport>;
  status: ExportStatus;
}

/** `smog-export-<YYYY-MM-DD>.json` (the UTC date). */
export function exportFileName(date: Date = new Date()): string {
  return `smog-export-${date.toISOString().slice(0, 10)}.json`;
}

/** The export as the saved file holds it: indented JSON. */
export function serializeExport(data: AccountExport): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** Downloads everything stored about the signed-in user. */
export function useExport(): Export {
  const client = useRpcClient<AccountSlice>();
  const [status, setStatus] = useState<ExportStatus>("idle");
  const exportAccount = useCallback(async (): Promise<AccountExport> => {
    setStatus("exporting");
    try {
      const data = await client.account.export();
      setStatus("idle");
      return data;
    } catch (error) {
      console.error("[account] Failed to export the account:", error);
      setStatus("error");
      throw error;
    }
  }, [client]);
  return { exportAccount, status };
}
