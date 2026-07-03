import MuxPlayer from "@mux/mux-player-react/lazy";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Upload, Video, X } from "lucide-react";
import { useState } from "react";
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

interface CreateGestureFormData {
  name: string;
  info: string;
  playbackId: string;
  concept: string[];
  categoryIds: string[];
  isActive: boolean;
}

export function CreateGestureDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [videoMode, setVideoMode] = useState<VideoMode | null>(null);
  const [conceptInput, setConceptInput] = useState("");
  const [form, setForm] = useState<CreateGestureFormData>({
    name: "",
    info: "",
    playbackId: "",
    concept: [],
    categoryIds: [],
    isActive: true,
  });

  const { data: categories } = useQuery(orpc.categories.list.queryOptions());

  const createMutation = useMutation({
    mutationFn: (data: CreateGestureFormData) =>
      client.admin.gestures.create(data),
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
    onError: (error) => {
      toast.error(`Failed to create gesture: ${error.message}`);
    },
  });

  const resetForm = () => {
    setForm({
      name: "",
      info: "",
      playbackId: "",
      concept: [],
      categoryIds: [],
      isActive: true,
    });
    setVideoMode(null);
    setConceptInput("");
  };

  const handleVideoSelect = (playbackId: string) => {
    setForm((prev) => ({ ...prev, playbackId }));
    setVideoMode(null);
  };

  const handleAddConcept = () => {
    const trimmed = conceptInput.trim();
    if (trimmed && !form.concept.includes(trimmed)) {
      setForm((prev) => ({ ...prev, concept: [...prev.concept, trimmed] }));
      setConceptInput("");
    }
  };

  const handleRemoveConcept = (concept: string) => {
    setForm((prev) => ({
      ...prev,
      concept: prev.concept.filter((c) => c !== concept),
    }));
  };

  const handleToggleCategory = (categoryId: string) => {
    setForm((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds.includes(categoryId)
        ? prev.categoryIds.filter((id) => id !== categoryId)
        : [...prev.categoryIds, categoryId],
    }));
  };

  const handleSubmit = () => {
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
  };

  const isValid =
    form.name.trim() && form.playbackId && form.categoryIds.length > 0;

  return (
    <Dialog
      onOpenChange={(newOpen) => {
        setOpen(newOpen);
        if (!newOpen) {
          resetForm();
        }
      }}
      open={open}
    >
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
                    style={{ width: "100%", aspectRatio: "16/9" }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="break-all font-mono text-muted-foreground text-xs">
                    {form.playbackId}
                  </p>
                  <Button
                    onClick={() =>
                      setForm((prev) => ({ ...prev, playbackId: "" }))
                    }
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
                  onClick={() => setVideoMode(null)}
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            ) : videoMode === "upload" ? (
              <MuxVideoUpload
                onCancel={() => setVideoMode(null)}
                onUploadComplete={handleVideoSelect}
              />
            ) : (
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => setVideoMode("select")}
                  variant="outline"
                >
                  <Video className="mr-2 h-4 w-4" />
                  Choose Existing
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => setVideoMode("upload")}
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
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="e.g., Hello, Thank You, Good Morning"
              value={form.name}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="info">Description</Label>
            <Textarea
              id="info"
              onChange={(e) =>
                setForm((prev) => ({ ...prev, info: e.target.value }))
              }
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
                onChange={(e) => setConceptInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddConcept();
                  }
                }}
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
                  <Badge
                    className="cursor-pointer pr-1"
                    key={concept}
                    onClick={() => handleRemoveConcept(concept)}
                    variant="secondary"
                  >
                    {concept}
                    <X className="ml-1 h-3 w-3" />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Categories */}
          <div className="space-y-2">
            <Label>Categories</Label>
            <div className="flex flex-wrap gap-2">
              {categories?.map((category) => {
                const isSelected = form.categoryIds.includes(category._id);
                return (
                  <Badge
                    className="cursor-pointer"
                    key={category._id}
                    onClick={() => handleToggleCategory(category._id)}
                    variant={isSelected ? "default" : "outline"}
                  >
                    {category.name}
                  </Badge>
                );
              })}
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
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, isActive: checked }))
              }
            />
            <Label htmlFor="isActive">Active (visible to users)</Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => {
              setOpen(false);
              resetForm();
            }}
            variant="outline"
          >
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
