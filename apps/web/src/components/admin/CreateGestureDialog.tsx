import MuxPlayer from "@mux/mux-player-react/lazy";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Upload, Video, X } from "lucide-react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { client, orpc } from "@/utils/orpc";
import { MuxVideoPicker } from "./MuxVideoPicker";
import { MuxVideoUpload } from "./MuxVideoUpload";

type VideoMode = "select" | "upload";

interface ConceptBadgeProps {
  concept: string;
  onRemove: (concept: string) => void;
}

/** Removable concept badge. */
function ConceptBadge({ concept, onRemove }: ConceptBadgeProps) {
  const handleClick = useCallback((): void => {
    onRemove(concept);
  }, [concept, onRemove]);

  return (
    <Badge
      className="cursor-pointer pr-1"
      onClick={handleClick}
      variant="secondary"
    >
      {concept}
      <X className="ml-1 h-3 w-3" />
    </Badge>
  );
}

interface CategoryBadgeProps {
  categoryId: string;
  isSelected: boolean;
  name: string;
  onToggle: (categoryId: string) => void;
}

/** Toggleable category badge. */
function CategoryBadge({
  categoryId,
  isSelected,
  name,
  onToggle,
}: CategoryBadgeProps) {
  const handleClick = useCallback((): void => {
    onToggle(categoryId);
  }, [categoryId, onToggle]);

  return (
    <Badge
      className="cursor-pointer"
      onClick={handleClick}
      variant={isSelected ? "default" : "outline"}
    >
      {name}
    </Badge>
  );
}

interface CreateGestureFormData {
  categoryIds: string[];
  concept: string[];
  info: string;
  isActive: boolean;
  name: string;
  playbackId: string;
}

export function CreateGestureDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [videoMode, setVideoMode] = useState<VideoMode | null>(null);
  const [conceptInput, setConceptInput] = useState("");
  const [form, setForm] = useState<CreateGestureFormData>({
    categoryIds: [],
    concept: [],
    info: "",
    isActive: true,
    name: "",
    playbackId: "",
  });

  const { data: categories } = useQuery(orpc.categories.list.queryOptions());

  const createMutation = useMutation({
    mutationFn: (data: CreateGestureFormData) =>
      client.admin.gestures.create(data),
    onError: (error) => {
      toast.error(`Failed to create gesture: ${error.message}`);
    },
    onSuccess: () => {
      toast.success("Gesture created successfully");
      setOpen(false);
      resetForm();
      queryClient.invalidateQueries({
        queryKey: orpc.admin.gestures.listAll.queryOptions({
          input: {
            includeInactive: true,
            limit: 500,
          },
        }).queryKey,
      });
    },
  });

  const resetForm = useCallback((): void => {
    setForm({
      categoryIds: [],
      concept: [],
      info: "",
      isActive: true,
      name: "",
      playbackId: "",
    });
    setVideoMode(null);
    setConceptInput("");
  }, []);

  const handleVideoSelect = useCallback((playbackId: string): void => {
    setForm((prev) => ({ ...prev, playbackId }));
    setVideoMode(null);
  }, []);

  const handleAddConcept = useCallback((): void => {
    const trimmed = conceptInput.trim();
    if (trimmed && !form.concept.includes(trimmed)) {
      setForm((prev) => ({ ...prev, concept: [...prev.concept, trimmed] }));
      setConceptInput("");
    }
  }, [conceptInput, form.concept]);

  const handleRemoveConcept = useCallback((concept: string): void => {
    setForm((prev) => ({
      ...prev,
      concept: prev.concept.filter((c) => c !== concept),
    }));
  }, []);

  const handleToggleCategory = useCallback((categoryId: string): void => {
    setForm((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds.includes(categoryId)
        ? prev.categoryIds.filter((id) => id !== categoryId)
        : [...prev.categoryIds, categoryId],
    }));
  }, []);

  const handleOpenChange = useCallback(
    (newOpen: boolean): void => {
      setOpen(newOpen);
      if (!newOpen) {
        resetForm();
      }
    },
    [resetForm]
  );

  const handleClearVideo = useCallback((): void => {
    setForm((prev) => ({ ...prev, playbackId: "" }));
  }, []);

  const handleClearVideoMode = useCallback((): void => {
    setVideoMode(null);
  }, []);

  const handleSelectMode = useCallback((): void => {
    setVideoMode("select");
  }, []);

  const handleUploadMode = useCallback((): void => {
    setVideoMode("upload");
  }, []);

  const handleNameChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      const { value } = e.target;
      setForm((prev) => ({ ...prev, name: value }));
    },
    []
  );

  const handleInfoChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>): void => {
      const { value } = e.target;
      setForm((prev) => ({ ...prev, info: value }));
    },
    []
  );

  const handleConceptInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      setConceptInput(e.target.value);
    },
    []
  );

  const handleConceptKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddConcept();
      }
    },
    [handleAddConcept]
  );

  const handleActiveChange = useCallback((checked: boolean): void => {
    setForm((prev) => ({ ...prev, isActive: checked }));
  }, []);

  const handleCancel = useCallback((): void => {
    setOpen(false);
    resetForm();
  }, [resetForm]);

  const handleSubmit = useCallback((): void => {
    if (!form.name.trim()) {
      toast.error("Please enter a gesture name");
      return;
    }
    if (!form.playbackId) {
      toast.error("Please select or upload a video");
      return;
    }
    if (form.categoryIds.length === 0) {
      toast.error("Please select at least one category");
      return;
    }
    createMutation.mutate(form);
  }, [form, createMutation]);

  const isValid =
    form.name.trim() && form.playbackId && form.categoryIds.length > 0;

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Gesture
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Gesture</DialogTitle>
          <DialogDescription>
            Add a new sign language gesture to the library
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Video Selection */}
          <div className="space-y-3">
            <Label>Video</Label>
            {form.playbackId ? (
              <div className="space-y-2">
                <div className="overflow-hidden rounded-lg border">
                  <MuxPlayer
                    loop
                    muted
                    playbackId={form.playbackId}
                    streamType="on-demand"
                    style={{ aspectRatio: "16/9", width: "100%" }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="break-all font-mono text-muted-foreground text-xs">
                    {form.playbackId}
                  </p>
                  <Button
                    onClick={handleClearVideo}
                    size="sm"
                    variant="outline"
                  >
                    Change Video
                  </Button>
                </div>
              </div>
            ) : videoMode === "select" ? (
              <div className="space-y-2">
                <MuxVideoPicker onSelect={handleVideoSelect} />
                <Button
                  className="w-full"
                  onClick={handleClearVideoMode}
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            ) : videoMode === "upload" ? (
              <MuxVideoUpload
                onCancel={handleClearVideoMode}
                onUploadComplete={handleVideoSelect}
              />
            ) : (
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={handleSelectMode}
                  variant="outline"
                >
                  <Video className="mr-2 h-4 w-4" />
                  Choose Existing
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleUploadMode}
                  variant="outline"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload New
                </Button>
              </div>
            )}
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              onChange={handleNameChange}
              placeholder="e.g., Hello, Thank You, Good Morning"
              value={form.name}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="info">Description</Label>
            <Textarea
              id="info"
              onChange={handleInfoChange}
              placeholder="Describe how to perform this gesture..."
              rows={3}
              value={form.info}
            />
          </div>

          {/* Concepts */}
          <div className="space-y-2">
            <Label>Concepts / Keywords</Label>
            <div className="flex gap-2">
              <Input
                onChange={handleConceptInputChange}
                onKeyDown={handleConceptKeyDown}
                placeholder="Add a concept and press Enter"
                value={conceptInput}
              />
              <Button
                onClick={handleAddConcept}
                type="button"
                variant="outline"
              >
                Add
              </Button>
            </div>
            {form.concept.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {form.concept.map((concept) => (
                  <ConceptBadge
                    concept={concept}
                    key={concept}
                    onRemove={handleRemoveConcept}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Categories */}
          <div className="space-y-2">
            <Label>Categories</Label>
            <div className="flex flex-wrap gap-2">
              {categories?.map((category) => (
                <CategoryBadge
                  categoryId={category._id}
                  isSelected={form.categoryIds.includes(category._id)}
                  key={category._id}
                  name={category.name}
                  onToggle={handleToggleCategory}
                />
              ))}
            </div>
            {form.categoryIds.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Select at least one category
              </p>
            )}
          </div>

          {/* Active Toggle */}
          <div className="flex items-center gap-2">
            <Switch
              checked={form.isActive}
              id="isActive"
              onCheckedChange={handleActiveChange}
            />
            <Label htmlFor="isActive">Active (visible to users)</Label>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleCancel} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!isValid || createMutation.isPending}
            onClick={handleSubmit}
          >
            {createMutation.isPending ? "Creating..." : "Create Gesture"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
