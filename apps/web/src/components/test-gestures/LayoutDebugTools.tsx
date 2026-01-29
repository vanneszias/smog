import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

interface LayoutDebugToolsProps {
  onToggleDarkMode?: () => void;
  isDarkMode?: boolean;
}

export function LayoutDebugTools({
  onToggleDarkMode,
  isDarkMode = false,
}: LayoutDebugToolsProps) {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const updateViewport = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  const getDeviceType = () => {
    const width = viewport.width;
    if (width < 640) {
      return "Mobile";
    }
    if (width < 768) {
      return "Mobile L";
    }
    if (width < 1024) {
      return "Tablet";
    }
    if (width < 1280) {
      return "Tablet L";
    }
    return "Desktop";
  };

  const getOrientation = () => {
    return viewport.width > viewport.height ? "Landscape" : "Portrait";
  };

  return (
    <div className="fixed top-4 right-4 z-50">
      {/* Collapsed View */}
      {!isExpanded && (
        <button
          className="rounded-lg border border-border bg-background/95 px-4 py-2 font-mono text-xs backdrop-blur-sm transition-all hover:bg-card"
          onClick={() => {
            setIsExpanded(true);
          }}
          style={{ color: "var(--text)" }}
          type="button"
        >
          {viewport.width} × {viewport.height} • {getDeviceType()}
        </button>
      )}

      {/* Expanded View */}
      {isExpanded && (
        <div
          className="min-w-[280px] rounded-lg border border-border bg-background/95 p-4 shadow-lg backdrop-blur-sm"
          style={{ color: "var(--text)" }}
        >
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-sm">Debug Tools</h3>
            <button
              className="rounded px-2 py-1 text-xs transition-colors hover:bg-muted"
              onClick={() => {
                setIsExpanded(false);
              }}
              type="button"
            >
              Collapse
            </button>
          </div>

          {/* Viewport Info */}
          <div className="mb-4 space-y-2 rounded-lg border border-border bg-card p-3">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Viewport:</span>
              <span className="font-medium font-mono">
                {viewport.width} × {viewport.height}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Device:</span>
              <span className="font-medium">{getDeviceType()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Orientation:</span>
              <span className="font-medium">{getOrientation()}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-2">
            <div className="text-muted-foreground text-xs">Controls:</div>

            {/* Dark Mode Toggle */}
            {onToggleDarkMode && (
              <button
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted"
                onClick={onToggleDarkMode}
                type="button"
              >
                <span className="text-xs">Theme</span>
                <div className="flex items-center gap-2">
                  {isDarkMode ? (
                    <>
                      <Moon className="h-4 w-4" />
                      <span className="text-xs">Dark</span>
                    </>
                  ) : (
                    <>
                      <Sun className="h-4 w-4" />
                      <span className="text-xs">Light</span>
                    </>
                  )}
                </div>
              </button>
            )}
          </div>

          {/* Breakpoint Reference */}
          <div className="mt-4 space-y-1 border-border border-t pt-3 text-xs">
            <div className="text-muted-foreground">Breakpoints:</div>
            <div className="font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">sm:</span>
                <span>640px</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">md:</span>
                <span>768px</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">lg:</span>
                <span>1024px</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">xl:</span>
                <span>1280px</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
