/**
 * Image processing service
 * Handles downloading and processing of overlay images
 */

import sharp from "sharp";
import { createImageProcessingError } from "../types/errors";
import {
  formatFileSize,
  getFileSize,
  verifyFileExists,
} from "../utils/filesystem";

export interface ImageProcessingOptions {
  imageUrl: string;
  destination: string;
  maxWidth?: number;
  maxHeight?: number;
}

export class ImageService {
  private readonly defaultMaxWidth = 200;
  private readonly defaultMaxHeight = 200;

  /**
   * Download and process overlay image
   * Converts to PNG with transparency support and resizes to fit constraints
   */
  async processImage(options: ImageProcessingOptions): Promise<void> {
    console.log(`[ImageService] Processing image from ${options.imageUrl}`);

    try {
      // Download image
      const imageBuffer = await this.downloadImage(options.imageUrl);
      console.log(
        `[ImageService] Downloaded image: ${formatFileSize(imageBuffer.length)}`
      );

      // Process with Sharp
      const maxWidth = options.maxWidth || this.defaultMaxWidth;
      const maxHeight = options.maxHeight || this.defaultMaxHeight;

      const sharpInstance = sharp(imageBuffer);
      const metadata = await sharpInstance.metadata();
      console.log(
        `[ImageService] Original dimensions: ${metadata.width}x${metadata.height}, format: ${metadata.format}`
      );

      // Resize and convert to PNG
      await sharpInstance
        .resize(maxWidth, maxHeight, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toFile(options.destination);

      const size = await getFileSize(options.destination);
      console.log(
        `[ImageService] Processed image (max ${maxWidth}x${maxHeight}px): ${formatFileSize(size)}`
      );

      // Verify the file
      await verifyFileExists(options.destination);
      console.log(`[ImageService] ✓ Image verified at: ${options.destination}`);
    } catch (error) {
      throw createImageProcessingError(
        options.imageUrl,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Download image from URL
   */
  private async downloadImage(imageUrl: string): Promise<Buffer> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download image: ${response.status} ${response.statusText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Get image metadata without processing
   */
  async getMetadata(
    imageUrl: string
  ): Promise<{ width?: number; height?: number; format?: string }> {
    const imageBuffer = await this.downloadImage(imageUrl);
    const metadata = await sharp(imageBuffer).metadata();

    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    };
  }
}
