import { File, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";

/**
 * Writes `text` to the cache directory as `fileName` and opens the share
 * sheet with it (save to Files, mail, AirDrop, …): the account export.
 */
export async function shareJsonFile(
  text: string,
  fileName: string,
  title: string
): Promise<void> {
  try {
    const file = new File(Paths.cache, fileName);
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
  }
}
