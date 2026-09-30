import { File, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";

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
 * Writes `text` to the cache directory as `fileName`, opens the share
 * sheet with it (save to Files, mail, AirDrop, …) and deletes it once the
 * sheet is done: the file holds personal data and live share links.
 */
export async function shareJsonFile(
  text: string,
  fileName: string,
  title: string
): Promise<void> {
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
    remove(file);
  }
}

/**
 * Deletes every export left in the cache directory (a crash mid-share):
 * on launch and when the account is deleted. Never throws.
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
