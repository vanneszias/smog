import type { OverlayConfig } from "@smog/types";
import { DEFAULT_OVERLAY_CONFIG } from "@smog/types";
import { Canvas, FabricImage, IText } from "fabric";
import { useCallback, useEffect, useRef, useState } from "react";

// Canvas dimensions (3:4 aspect ratio for vertical video)
const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 960;

interface OverlayEditorProps {
  imageFile: File | null;
  imagePreview: string | null;
  overlayText: string;
  onTextChange: (text: string) => void;
  onConfigChange: (config: OverlayConfig) => void;
  initialConfig?: OverlayConfig;
}

export function OverlayEditor({
  imagePreview,
  overlayText,
  onTextChange,
  onConfigChange,
  initialConfig = DEFAULT_OVERLAY_CONFIG,
}: OverlayEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const backgroundImageRef = useRef<FabricImage | null>(null);
  const imageObjectRef = useRef<FabricImage | null>(null);
  const textObjectRef = useRef<IText | null>(null);
  const [config, setConfig] = useState<OverlayConfig>(initialConfig);

  // Initialize canvas with static background
  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const canvas = new Canvas(canvasRef.current, {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: "#e8f4f0",
      selection: true,
    });

    fabricCanvasRef.current = canvas;

    // Load static background image
    const backgroundUrl = "/assets/background.png";
    FabricImage.fromURL(backgroundUrl)
      .then((fabricImage) => {
        // Scale to fit canvas exactly
        const scaleX = CANVAS_WIDTH / (fabricImage.width || CANVAS_WIDTH);
        const scaleY = CANVAS_HEIGHT / (fabricImage.height || CANVAS_HEIGHT);

        fabricImage.set({
          left: 0,
          top: 0,
          scaleX,
          scaleY,
          selectable: false,
          evented: false,
          opacity: 1,
        });

        canvas.add(fabricImage);
        canvas.sendObjectToBack(fabricImage);
        backgroundImageRef.current = fabricImage;
        canvas.renderAll();
      })
      .catch((error) => {
        console.error("Failed to load background image:", error);
      });

    return () => {
      canvas.dispose();
      fabricCanvasRef.current = null;
      backgroundImageRef.current = null;
    };
  }, []);

  // Constrain objects to canvas bounds
  const constrainToBounds = useCallback((obj: FabricImage | IText) => {
    const boundingRect = obj.getBoundingRect();

    if (boundingRect.left < 0) {
      obj.set({ left: (obj.left ?? 0) - boundingRect.left });
    }
    if (boundingRect.top < 0) {
      obj.set({ top: (obj.top ?? 0) - boundingRect.top });
    }
    if (boundingRect.left + boundingRect.width > CANVAS_WIDTH) {
      obj.set({
        left:
          (obj.left ?? 0) -
          (boundingRect.left + boundingRect.width - CANVAS_WIDTH),
      });
    }
    if (boundingRect.top + boundingRect.height > CANVAS_HEIGHT) {
      obj.set({
        top:
          (obj.top ?? 0) -
          (boundingRect.top + boundingRect.height - CANVAS_HEIGHT),
      });
    }
  }, []);

  // Update config from current canvas state
  const updateConfigFromCanvas = useCallback(() => {
    if (!fabricCanvasRef.current) {
      return;
    }

    const imageObj = imageObjectRef.current;
    const textObj = textObjectRef.current;

    const hasNoObjects = imageObj === null && textObj === null;
    if (hasNoObjects) {
      return;
    }

    const newConfig: OverlayConfig = { ...config };

    if (imageObj) {
      const imageBounds = imageObj.getBoundingRect();
      // Store center point as percentages
      const centerX = imageBounds.left + imageBounds.width / 2;
      const centerY = imageBounds.top + imageBounds.height / 2;
      newConfig.image = {
        x: (centerX / CANVAS_WIDTH) * 100,
        y: (centerY / CANVAS_HEIGHT) * 100,
        width: (imageBounds.width / CANVAS_WIDTH) * 100,
        height: (imageBounds.height / CANVAS_HEIGHT) * 100,
      };
    }

    if (textObj) {
      // Text has originX: "center", so textObj.left is already the center X position
      // Use bounding rect for Y (top edge) to match FFMPEG drawtext behavior
      const textBounds = textObj.getBoundingRect();
      const centerX = textObj.left ?? 0;
      newConfig.text = {
        x: (centerX / CANVAS_WIDTH) * 100,
        y: (textBounds.top / CANVAS_HEIGHT) * 100,
        fontSize: ((textObj.fontSize || 20) / CANVAS_HEIGHT) * 100,
        color: config.text.color,
      };
    }

    setConfig(newConfig);
    onConfigChange(newConfig);
  }, [config, onConfigChange]);

  // Add/update image when imagePreview changes
  useEffect(() => {
    const hasCanvas = fabricCanvasRef.current !== null;
    const hasImage = imagePreview !== null;
    const hasCanvasAndImage = hasCanvas && hasImage;
    if (!hasCanvasAndImage) {
      return;
    }

    const canvas = fabricCanvasRef.current;
    if (!canvas) {
      return;
    }

    // Remove old image if exists
    if (imageObjectRef.current) {
      canvas.remove(imageObjectRef.current);
      imageObjectRef.current = null;
    }

    // Load and add new image
    const imgElement = new Image();
    imgElement.src = imagePreview;
    imgElement.onload = () => {
      FabricImage.fromURL(imagePreview)
        .then((fabricImage) => {
          // Calculate initial position and size from config
          // Config stores center points, convert to top-left for Fabric.js
          const targetWidth = (config.image.width / 100) * CANVAS_WIDTH;
          const targetHeight = (config.image.height / 100) * CANVAS_HEIGHT;
          const centerX = (config.image.x / 100) * CANVAS_WIDTH;
          const centerY = (config.image.y / 100) * CANVAS_HEIGHT;

          // Use the original image aspect ratio - calculate scale to maintain it
          const imageWidth = fabricImage.width || 1;
          const imageHeight = fabricImage.height || 1;

          // Scale to fit within the target dimensions while preserving aspect ratio
          const scaleToFitWidth = targetWidth / imageWidth;
          const scaleToFitHeight = targetHeight / imageHeight;
          const finalScale = Math.min(scaleToFitWidth, scaleToFitHeight);

          // Calculate actual scaled dimensions
          const actualWidth = imageWidth * finalScale;
          const actualHeight = imageHeight * finalScale;

          // Position based on actual scaled size, not target size
          const left = centerX - actualWidth / 2;
          const top = centerY - actualHeight / 2;

          fabricImage.set({
            left,
            top,
            scaleX: finalScale,
            scaleY: finalScale,
            cornerStyle: "circle",
            borderColor: "#3b82f6",
            cornerColor: "#3b82f6",
            transparentCorners: false,
            lockScalingFlip: true,
          });

          canvas.add(fabricImage);
          imageObjectRef.current = fabricImage;

          // Ensure text stays on top if it exists
          if (textObjectRef.current) {
            canvas.bringObjectToFront(textObjectRef.current);
          }

          // Update config when image moves or scales
          fabricImage.on("modified", () => {
            updateConfigFromCanvas();
          });

          // Constrain to canvas bounds
          fabricImage.on("moving", () => {
            constrainToBounds(fabricImage);
          });

          fabricImage.on("scaling", () => {
            constrainToBounds(fabricImage);
          });

          canvas.renderAll();
        })
        .catch((error) => {
          console.error("Failed to load image:", error);
        });
    };
  }, [
    imagePreview,
    config.image.x,
    config.image.y,
    config.image.width,
    config.image.height,
    updateConfigFromCanvas,
    constrainToBounds,
  ]);

  // Add/update text - Create once and update text content separately
  // Note: overlayText is intentionally not in the dependency array
  // We only use it for initial creation, and updates are handled by event listeners
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) {
      return;
    }

    // Only create text object if it doesn't exist
    if (textObjectRef.current) {
      return;
    }

    // Always create text object, use placeholder if empty
    const displayText = overlayText || "Click to add text";

    // Calculate initial position and size from config
    // Config stores center point for x, top edge for y
    const fontSize = (config.text.fontSize / 100) * CANVAS_HEIGHT;
    const centerX = (config.text.x / 100) * CANVAS_WIDTH;
    const top = (config.text.y / 100) * CANVAS_HEIGHT;

    const fabricText = new IText(displayText, {
      left: centerX,
      top,
      fontSize,
      fill: overlayText ? config.text.color : "#999999",
      fontFamily: "Arial",
      editable: true,
      selectable: true,
      evented: true,
      hoverCursor: "text",
      cornerStyle: "circle",
      borderColor: "#3b82f6",
      cornerColor: "#3b82f6",
      transparentCorners: false,
      originX: "center", // Center the text horizontally
      splitByGrapheme: true, // Better text editing
      fontStyle: overlayText ? "normal" : "italic",
      lockScalingFlip: true,
    });

    canvas.add(fabricText);
    textObjectRef.current = fabricText;

    // Bring text to front so it's always editable
    canvas.bringObjectToFront(fabricText);

    // Update config when text moves or scales
    fabricText.on("modified", () => {
      updateConfigFromCanvas();
    });

    // Constrain to canvas bounds
    fabricText.on("moving", () => {
      constrainToBounds(fabricText);
    });

    fabricText.on("scaling", () => {
      constrainToBounds(fabricText);
    });

    // Set up canvas-level event listeners for text editing
    const handleTextChanged = () => {
      if (textObjectRef.current) {
        const textContent = textObjectRef.current.text;
        if (textContent !== null) {
          onTextChange(textContent);
        }
      }
    };

    const handleTextEditingExited = () => {
      if (textObjectRef.current) {
        const textContent = textObjectRef.current.text;
        if (textContent !== null) {
          onTextChange(textContent);
        }
      }
    };

    canvas.on("text:changed", handleTextChanged);
    canvas.on("text:editing:exited", handleTextEditingExited);

    canvas.renderAll();

    // Cleanup function to remove canvas event listeners
    return () => {
      canvas.off("text:changed", handleTextChanged);
      canvas.off("text:editing:exited", handleTextEditingExited);
    };
  }, [
    config.text.color,
    config.text.x,
    config.text.y,
    config.text.fontSize,
    updateConfigFromCanvas,
    onTextChange,
    constrainToBounds,
    overlayText,
  ]);

  // Update text content when overlayText prop changes from outside
  useEffect(() => {
    if (!textObjectRef.current) {
      return;
    }
    // Only update if the text object's content is different
    if (textObjectRef.current.text !== overlayText) {
      textObjectRef.current.set({ text: overlayText || "Click to add text" });
      fabricCanvasRef.current?.renderAll();
    }
  }, [overlayText]);

  // Update text font size when config changes
  useEffect(() => {
    if (!textObjectRef.current) {
      return;
    }
    const fontSize = (config.text.fontSize / 100) * CANVAS_HEIGHT;
    textObjectRef.current.set({ fontSize });
    fabricCanvasRef.current?.renderAll();
  }, [config.text.fontSize]);

  // Update text color when config changes
  useEffect(() => {
    if (!textObjectRef.current) {
      return;
    }
    textObjectRef.current.set({ fill: config.text.color });
    fabricCanvasRef.current?.renderAll();
  }, [config.text.color]);

  return (
    <div className="space-y-4">
      {/* Canvas */}
      <div className="relative flex justify-center">
        <canvas className="rounded border border-border" ref={canvasRef} />
      </div>
    </div>
  );
}
