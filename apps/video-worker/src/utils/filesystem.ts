/**
 * File system utilities for video processing
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { v4 as uuidv4 } from "uuid";

export interface WorkspaceFiles {
  workDir: string;
  videoPath: string;
  overlayPath: string;
  outputPath: string;
}

/**
 * Create a temporary workspace directory with standard file paths
 *
 * @param baseDir - Base directory for temporary files (default: /tmp/video-processing)
 * @returns Workspace paths
 */
export const createWorkspace = async (
  baseDir = "/tmp/video-processing"
): Promise<WorkspaceFiles> => {
  const workDir = path.join(baseDir, uuidv4());
  await fs.mkdir(workDir, { recursive: true });

  return {
    workDir,
    videoPath: path.join(workDir, "original.mp4"),
    overlayPath: path.join(workDir, "overlay.png"),
    outputPath: path.join(workDir, "composed.mp4"),
  };
};

/**
 * Clean up a workspace directory
 *
 * @param workDir - Directory to clean up
 */
export const cleanupWorkspace = async (workDir: string): Promise<void> => {
  try {
    await fs.rm(workDir, { recursive: true, force: true });
    console.log(`[Cleanup] Removed workspace: ${workDir}`);
  } catch (error) {
    console.error(`[Cleanup] Failed to remove workspace: ${workDir}`, error);
    throw error;
  }
};

/**
 * Verify that a file exists and is readable
 *
 * @param filePath - Path to verify
 * @throws Error if file is not accessible
 */
export const verifyFileExists = async (filePath: string): Promise<void> => {
  await fs.access(filePath);
};

/**
 * Get file size in bytes
 *
 * @param filePath - Path to file
 * @returns File size in bytes
 */
export const getFileSize = async (filePath: string): Promise<number> => {
  const stats = await fs.stat(filePath);
  return stats.size;
};

/**
 * Format file size for display
 *
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "2.5 MB")
 */
export const formatFileSize = (bytes: number): string => {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(2)} MB`;
};
