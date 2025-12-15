/**
 * Image Converter
 * Single responsibility: Convert image files to base64
 */

export class ImageConverter {
  /**
   * Convert file to base64 data URL
   */
  async toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to convert image to base64"));
        }
      };

      reader.onerror = () => {
        reject(new Error("Failed to read image file"));
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * Validate image file
   */
  validate(file: File): { valid: boolean; error?: string } {
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (file.size > maxSize) {
      return {
        valid: false,
        error: "Image must be smaller than 5MB",
      };
    }

    if (!file.type.startsWith("image/")) {
      return {
        valid: false,
        error: "File must be an image",
      };
    }

    return { valid: true };
  }
}
