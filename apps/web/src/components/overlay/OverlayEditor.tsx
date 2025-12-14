import type { OverlayConfig } from "@smog/types";
import { DEFAULT_OVERLAY_CONFIG } from "@smog/types";
import { Canvas, FabricImage, FabricText } from "fabric";
import { useCallback, useEffect, useRef, useState } from "react";

// Canvas dimensions (16:9 aspect ratio for video preview)
const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;

type OverlayEditorProps = {
  imageFile: File | null;
  imagePreview: string | null;
  overlayText: string;
  onTextChange: (text: string) => void;
  onConfigChange: (config: OverlayConfig) => void;
  initialConfig?: OverlayConfig;
};

export function OverlayEditor({
  imagePreview,
  overlayText,
  onTextChange,
  onConfigChange,
  initialConfig = DEFAULT_OVERLAY_CONFIG,
}: OverlayEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const imageObjectRef = useRef<FabricImage | null>(null);
  const textObjectRef = useRef<FabricText | null>(null);
  const [config, setConfig] = useState<OverlayConfig>(initialConfig);

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const canvas = new Canvas(canvasRef.current, {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: "#1a1a1a",
      selection: true,
    });

    fabricCanvasRef.current = canvas;

    // Add guidelines text
    const guideText = new FabricText(
      "Drag and resize elements to position your overlay",
      {
        left: CANVAS_WIDTH / 2,
        top: 20,
        fontSize: 14,
        fill: "#666666",
        selectable: false,
        evented: false,
        originX: "center",
      }
    );
    canvas.add(guideText);

    return () => {
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, []);

  // Constrain objects to canvas bounds
  const constrainToBounds = useCallback((obj: FabricImage | FabricText) => {
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
      newConfig.image = {
        x: (imageBounds.left / CANVAS_WIDTH) * 100,
        y: (imageBounds.top / CANVAS_HEIGHT) * 100,
        width: (imageBounds.width / CANVAS_WIDTH) * 100,
        height: (imageBounds.height / CANVAS_HEIGHT) * 100,
      };
    }

    if (textObj) {
      const textBounds = textObj.getBoundingRect();
      newConfig.text = {
        x: (textBounds.left / CANVAS_WIDTH) * 100,
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
          const left = (config.image.x / 100) * CANVAS_WIDTH;
          const top = (config.image.y / 100) * CANVAS_HEIGHT;
          const targetWidth = (config.image.width / 100) * CANVAS_WIDTH;
          const targetHeight = (config.image.height / 100) * CANVAS_HEIGHT;

          fabricImage.set({
            left,
            top,
            scaleX: targetWidth / (fabricImage.width || 1),
            scaleY: targetHeight / (fabricImage.height || 1),
            cornerStyle: "circle",
            borderColor: "#3b82f6",
            cornerColor: "#3b82f6",
            transparentCorners: false,
            lockUniScaling: true, // Maintain aspect ratio by default
          });

          canvas.add(fabricImage);
          imageObjectRef.current = fabricImage;

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

  // Add/update text when overlayText changes
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) {
      return;
    }

    // Remove old text if exists
    if (textObjectRef.current) {
      canvas.remove(textObjectRef.current);
      textObjectRef.current = null;
    }

    if (!overlayText) {
      return;
    }

    // Calculate initial position and size from config
    const left = (config.text.x / 100) * CANVAS_WIDTH;
    const top = (config.text.y / 100) * CANVAS_HEIGHT;
    const fontSize = (config.text.fontSize / 100) * CANVAS_HEIGHT;

    const fabricText = new FabricText(overlayText, {
      left,
      top,
      fontSize,
      fill: config.text.color,
      fontFamily: "Arial",
      editable: true,
      cornerStyle: "circle",
      borderColor: "#3b82f6",
      cornerColor: "#3b82f6",
      transparentCorners: false,
    });

    canvas.add(fabricText);
    textObjectRef.current = fabricText;

    // Update config when text moves or scales
    fabricText.on("modified", () => {
      updateConfigFromCanvas();
      // Update text content if edited
      const textContent = fabricText.text;
      if (textContent !== null && textContent !== overlayText) {
        onTextChange(textContent);
      }
    });

    // Constrain to canvas bounds
    fabricText.on("moving", () => {
      constrainToBounds(fabricText);
    });

    fabricText.on("scaling", () => {
      constrainToBounds(fabricText);
    });

    canvas.renderAll();
  }, [
    overlayText,
    config.text.color,
    config.text.x,
    config.text.y,
    config.text.fontSize,
    updateConfigFromCanvas,
    onTextChange,
    constrainToBounds,
  ]);

  // Update text font size when config changes
  useEffect(() => {
    if (!textObjectRef.current) {
      return;
    }
    const fontSize = (config.text.fontSize / 100) * CANVAS_HEIGHT;
    textObjectRef.current.set({ fontSize });
    fabricCanvasRef.current?.renderAll();
  }, [config.text.fontSize]);

  // Update config from controls
  const updateConfig = (updates: Partial<OverlayConfig>) => {
    const newConfig = {
      ...config,
      ...updates,
      image: { ...config.image, ...(updates.image || {}) },
      text: { ...config.text, ...(updates.text || {}) },
      animation: { ...config.animation, ...(updates.animation || {}) },
    };
    setConfig(newConfig);
    onConfigChange(newConfig);
  };

  // Reset to default configuration
  const resetToDefaults = () => {
    setConfig(DEFAULT_OVERLAY_CONFIG);
    onConfigChange(DEFAULT_OVERLAY_CONFIG);

    // Update canvas objects
    if (imageObjectRef.current) {
      const left = (DEFAULT_OVERLAY_CONFIG.image.x / 100) * CANVAS_WIDTH;
      const top = (DEFAULT_OVERLAY_CONFIG.image.y / 100) * CANVAS_HEIGHT;
      const targetWidth =
        (DEFAULT_OVERLAY_CONFIG.image.width / 100) * CANVAS_WIDTH;
      const targetHeight =
        (DEFAULT_OVERLAY_CONFIG.image.height / 100) * CANVAS_HEIGHT;

      imageObjectRef.current.set({
        left,
        top,
        scaleX: targetWidth / (imageObjectRef.current.width || 1),
        scaleY: targetHeight / (imageObjectRef.current.height || 1),
      });
    }

    if (textObjectRef.current) {
      const left = (DEFAULT_OVERLAY_CONFIG.text.x / 100) * CANVAS_WIDTH;
      const top = (DEFAULT_OVERLAY_CONFIG.text.y / 100) * CANVAS_HEIGHT;
      const fontSize =
        (DEFAULT_OVERLAY_CONFIG.text.fontSize / 100) * CANVAS_HEIGHT;

      textObjectRef.current.set({
        left,
        top,
        fontSize,
        fill: DEFAULT_OVERLAY_CONFIG.text.color,
      });
    }

    fabricCanvasRef.current?.renderAll();
  };

  return (
    <div className="space-y-4">
      {/* Canvas */}
      <div className="relative">
        <canvas className="rounded border border-border" ref={canvasRef} />
        {!imagePreview && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-gray-500 text-sm">
              Upload an image to start customizing
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      {imagePreview ? (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold" style={{ color: "var(--text)" }}>
            Customize Overlay
          </h3>

          {/* Font Size */}
          <div>
            <label
              className="mb-2 block font-medium text-sm"
              htmlFor="font-size-slider"
              style={{ color: "var(--text)" }}
            >
              Text Size:{" "}
              {Math.round((config.text.fontSize / 100) * CANVAS_HEIGHT)}px
            </label>
            <input
              className="w-full"
              id="font-size-slider"
              max="100"
              min="10"
              onChange={(e) => {
                const fontSize =
                  (Number.parseInt(e.target.value, 10) / CANVAS_HEIGHT) * 100;
                updateConfig({ text: { ...config.text, fontSize } });
              }}
              type="range"
              value={(config.text.fontSize / 100) * CANVAS_HEIGHT}
            />
          </div>

          {/* Text Color */}
          <div>
            <label
              className="mb-2 block font-medium text-sm"
              htmlFor="text-color"
              style={{ color: "var(--text)" }}
            >
              Text Color
            </label>
            <div className="flex items-center gap-2">
              <input
                className="h-10 w-20 cursor-pointer rounded border border-border"
                id="text-color"
                onChange={(e) => {
                  updateConfig({
                    text: { ...config.text, color: e.target.value },
                  });
                }}
                type="color"
                value={config.text.color}
              />
              <input
                className="flex-1 rounded border border-border px-3 py-2"
                maxLength={7}
                onChange={(e) => {
                  if (/^#[\dA-Fa-f]{0,6}$/.test(e.target.value)) {
                    updateConfig({
                      text: { ...config.text, color: e.target.value },
                    });
                  }
                }}
                placeholder="#000000"
                type="text"
                value={config.text.color}
              />
            </div>
          </div>

          {/* Animation Timing */}
          <div>
            <label
              className="mb-2 block font-medium text-sm"
              htmlFor="animation-timing"
              style={{ color: "var(--text)" }}
            >
              Show overlay in last {config.animation.startTime} seconds
            </label>
            <input
              className="w-full"
              id="animation-timing"
              max="15"
              min="3"
              onChange={(e) => {
                updateConfig({
                  animation: {
                    ...config.animation,
                    startTime: Number.parseInt(e.target.value, 10),
                  },
                });
              }}
              type="range"
              value={config.animation.startTime}
            />
          </div>

          {/* Fade In Duration */}
          <div>
            <label
              className="mb-2 block font-medium text-sm"
              htmlFor="fade-duration"
              style={{ color: "var(--text)" }}
            >
              Fade-in duration: {config.animation.fadeInDuration}s
            </label>
            <input
              className="w-full"
              id="fade-duration"
              max="3"
              min="0"
              onChange={(e) => {
                updateConfig({
                  animation: {
                    ...config.animation,
                    fadeInDuration: Number.parseFloat(e.target.value),
                  },
                });
              }}
              step="0.5"
              type="range"
              value={config.animation.fadeInDuration}
            />
          </div>

          {/* Reset Button */}
          <button
            className="w-full rounded border border-border px-4 py-2 hover:bg-gray-50"
            onClick={resetToDefaults}
            style={{ color: "var(--text)" }}
            type="button"
          >
            Reset to Defaults
          </button>
        </div>
      ) : null}
    </div>
  );
}
