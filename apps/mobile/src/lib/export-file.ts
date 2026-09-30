import { File, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";
import { Platform } from "react-native";

/** The export's file names (`exportFileName`): `smog-export-YYYY-MM-DD.json`. */
const EXPORT_FILE = /^smog-export-.*\.json$/;

function remove(file: File): void {
  try {
    file.delete();
  } catch (error) {
    console.error("[export] Failed to delete an export file:", error);
  }
}

/**
 * Deletes every export in the cache directory: at launch, when the account
 * is deleted, and before a new one is written. Never throws.
 */
export function sweepExportFiles(): void {
  try {
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File && EXPORT_FILE.test(entry.name)) {
        remove(entry);
      }
    }
  } catch (error) {
    console.error("[export] Failed to sweep the export files:", error);
  }
}

/**
 * Writes `text` to the cache directory as `fileName` and opens the share
 * sheet with it (save to Files, mail, AirDrop, …). The file holds personal
 * data and live share links, so it does not stay:
 * - iOS: deleted once the sheet closes (`shareAsync` resolves then);
 * - Android: `shareAsync` can resolve while the receiving app still reads
 *   the content URI (a background upload), so it stays until the next
 *   sweep (the next launch, the next export, or account deletion).
 */
export async function shareJsonFile(
  text: string,
  fileName: string,
  title: string,
  platform: typeof Platform.OS = Platform.OS
): Promise<void> {
  sweepExportFiles();
  const file = new File(Paths.cache, fileName);
  try {
    file.create({ overwrite: true });
    file.write(text);
    await shareAsync(file.uri, {
      dialogTitle: title,
      mimeType: "application/json",
      UTI: "public.json",
    });
  } catch (error) {
    console.error("[export] Failed to share the export:", error);
    throw error;
  } finally {
    if (platform !== "android") {
      remove(file);
    }
  }
}
