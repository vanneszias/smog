import { useMutation } from "@tanstack/react-query";
import { CheckCircle, Loader2, Upload, XCircle } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { client } from "@/utils/orpc";

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; progress: number }
  | { status: "processing"; uploadId: string }
  | { status: "complete"; playbackId: string }
  | { status: "error"; message: string };

interface MuxVideoUploadProps {
  onUploadComplete: (playbackId: string) => void;
  onCancel?: () => void;
}

export function MuxVideoUpload({
  onUploadComplete,
  onCancel,
}: MuxVideoUploadProps) {
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const createUploadMutation = useMutation({
    mutationFn: () => client.admin.mux.createDirectUpload(),
  });

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const handleAssetCreated = useCallback(
    async (assetId: string) => {
      const assetStatus = await client.admin.mux.getAssetStatus({ assetId });

      if (assetStatus.status === "ready" && assetStatus.playbackId) {
        stopPolling();
        setState({ status: "complete", playbackId: assetStatus.playbackId });
        onUploadComplete(assetStatus.playbackId);
        return true;
      }
      if (assetStatus.status === "errored") {
        stopPolling();
        setState({ status: "error", message: "Video processing failed" });
        return true;
      }
      return false; // Keep polling
    },
    [onUploadComplete, stopPolling]
  );

  const pollUploadStatus = useCallback(
    async (uploadId: string) => {
      try {
        const status = await client.admin.mux.getUploadStatus({ uploadId });

        if (status.status === "asset_created" && status.assetId) {
          await handleAssetCreated(status.assetId);
          return;
        }

        if (status.status === "errored") {
          stopPolling();
          setState({
            status: "error",
            message: status.error || "Upload failed",
          });
          return;
        }

        if (status.status === "cancelled" || status.status === "timed_out") {
          stopPolling();
          setState({ status: "error", message: `Upload ${status.status}` });
        }
      } catch (error) {
        stopPolling();
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Polling failed",
        });
      }
    },
    [handleAssetCreated, stopPolling]
  );

  const startPolling = useCallback(
    (uploadId: string) => {
      stopPolling();
      pollingRef.current = setInterval(() => {
        pollUploadStatus(uploadId);
      }, 2000);
    },
    [pollUploadStatus, stopPolling]
  );

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("video/")) {
        setState({ status: "error", message: "Please select a video file" });
        return;
      }

      try {
        // Get upload URL from server
        const { uploadId, uploadUrl } =
          await createUploadMutation.mutateAsync();

        setState({ status: "uploading", progress: 0 });

        // Upload file directly to Mux via XHR for progress tracking
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
              const progress = Math.round((event.loaded / event.total) * 100);
              setState({ status: "uploading", progress });
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed: ${xhr.status}`));
            }
          });

          xhr.addEventListener("error", () => {
            reject(new Error("Upload failed"));
          });

          xhr.open("PUT", uploadUrl);
          xhr.send(file);
        });

        // Start polling for processing status
        setState({ status: "processing", uploadId });
        startPolling(uploadId);
      } catch (error) {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Upload failed",
        });
      }
    },
    [createUploadMutation, startPolling]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        uploadFile(file);
      }
    },
    [uploadFile]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setIsDragging(true);
    },
    []
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setIsDragging(false);
    },
    []
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        uploadFile(file);
      }
    },
    [uploadFile]
  );

  const handleReset = useCallback(() => {
    stopPolling();
    setState({ status: "idle" });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [stopPolling]);

  if (state.status === "complete") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-green-500 bg-green-50 p-6 dark:bg-green-950">
        <CheckCircle className="h-12 w-12 text-green-500" />
        <p className="font-medium text-green-700 dark:text-green-300">
          Upload complete!
        </p>
        <p className="break-all font-mono text-muted-foreground text-xs">
          {state.playbackId}
        </p>
        <Button onClick={handleReset} size="sm" variant="outline">
          Upload Another
        </Button>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-red-500 bg-red-50 p-6 dark:bg-red-950">
        <XCircle className="h-12 w-12 text-red-500" />
        <p className="font-medium text-red-700 dark:text-red-300">
          {state.message}
        </p>
        <Button onClick={handleReset} size="sm" variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  if (state.status === "uploading") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed p-6">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="font-medium">Uploading... {state.progress}%</p>
        <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${state.progress}%` }}
          />
        </div>
      </div>
    );
  }

  if (state.status === "processing") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed p-6">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="font-medium">Processing video...</p>
        <p className="text-muted-foreground text-sm">
          This may take a few moments
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        className={`flex w-full cursor-pointer flex-col items-center gap-4 rounded-lg border-2 border-dashed p-8 transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50"
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        type="button"
      >
        <Upload className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <p className="font-medium">Drop a video file here</p>
          <p className="text-muted-foreground text-sm">or click to browse</p>
        </div>
        <input
          accept="video/*"
          className="hidden"
          onChange={handleFileSelect}
          ref={fileInputRef}
          type="file"
        />
      </button>
      {onCancel && (
        <Button className="w-full" onClick={onCancel} variant="outline">
          Cancel
        </Button>
      )}
    </div>
  );
}
