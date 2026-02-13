import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Pencil, Plus, Tag, Trash2 } from "lucide-react";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { client, orpc } from "@/utils/orpc";

interface Category {
  _id: string;
  name: string;
  isActive: boolean;
  _creationTime: number;
}

export function CategoriesManagement() {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialog, setEditDialog] = useState<Category | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<Category | null>(null);
  const [createForm, setCreateForm] = useState({
    name: "",
    isActive: true,
  });
  const [editForm, setEditForm] = useState({
    name: "",
    isActive: true,
  });

  const { data: categories, isLoading } = useQuery(
    orpc.admin.categories.listAll.queryOptions()
  );

  const createMutation = useMutation({
    mutationFn: (data: { name: string; isActive: boolean }) =>
      client.admin.categories.create(data),
    onSuccess: () => {
      toast.success("Category created successfully");
      setCreateDialogOpen(false);
      setCreateForm({ name: "", isActive: true });
      queryClient.invalidateQueries({
        queryKey: orpc.admin.categories.listAll.queryOptions().queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: orpc.categories.list.queryOptions().queryKey,
      });
    },
    onError: (error) => {
      toast.error(`Failed to create category: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: {
      categoryId: string;
      name?: string;
      isActive?: boolean;
    }) => client.admin.categories.update(data),
    onSuccess: () => {
      toast.success("Category updated successfully");
      setEditDialog(null);
      queryClient.invalidateQueries({
        queryKey: orpc.admin.categories.listAll.queryOptions().queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: orpc.categories.list.queryOptions().queryKey,
      });
    },
    onError: (error) => {
      toast.error(`Failed to update category: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (categoryId: string) =>
      client.admin.categories.delete({ categoryId }),
    onSuccess: () => {
      toast.success("Category deleted successfully");
      setDeleteDialog(null);
      queryClient.invalidateQueries({
        queryKey: orpc.admin.categories.listAll.queryOptions().queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: orpc.categories.list.queryOptions().queryKey,
      });
    },
    onError: (error) => {
      toast.error(`Failed to delete category: ${error.message}`);
    },
  });

  const handleEdit = (category: Category) => {
    setEditDialog(category);
    setEditForm({
      name: category.name,
      isActive: category.isActive,
    });
  };

  const handleCreateSubmit = () => {
    if (!createForm.name.trim()) {
      toast.error("Please enter a category name");
      return;
    }
    createMutation.mutate(createForm);
  };

  const handleEditSubmit = () => {
    if (!editDialog) {
      return;
    }
    if (!editForm.name.trim()) {
      toast.error("Please enter a category name");
      return;
    }
    updateMutation.mutate({
      categoryId: editDialog._id,
      name: editForm.name,
      isActive: editForm.isActive,
    });
  };

  const activeCategories = categories?.filter((c) => c.isActive) || [];
  const inactiveCategories = categories?.filter((c) => !c.isActive) || [];

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--admin-accent)] border-t-transparent" />
          <p className="text-[var(--admin-text-muted)] text-sm">
            Loading categories...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--admin-accent)]/10">
              <Tag className="h-5 w-5 text-[var(--admin-accent)]" />
            </div>
            <div>
              <p className="font-semibold text-[var(--admin-text)] text-lg">
                {categories?.length || 0}
              </p>
              <p className="text-[var(--admin-text-muted)] text-xs">
                Total Categories
              </p>
            </div>
          </div>
          <div className="h-8 w-px bg-[var(--admin-border)]" />
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-[var(--admin-text-secondary)]">
              <Eye className="h-4 w-4 text-[var(--admin-success)]" />
              {activeCategories.length} Active
            </span>
            <span className="flex items-center gap-1.5 text-[var(--admin-text-secondary)]">
              <EyeOff className="h-4 w-4 text-[var(--admin-text-muted)]" />
              {inactiveCategories.length} Hidden
            </span>
          </div>
        </div>

        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Category
        </Button>
      </div>

      {/* Active Categories */}
      <div className="space-y-3">
        <h3 className="font-semibold text-[var(--admin-text)] text-base">
          Active Categories
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeCategories.map((category) => (
            <div
              className="group flex items-center justify-between rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-4 transition-all hover:border-[var(--admin-accent)]/30 hover:shadow-md"
              key={category._id}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--admin-accent)]/10">
                  <Tag className="h-4 w-4 text-[var(--admin-accent)]" />
                </div>
                <div>
                  <p className="font-medium text-[var(--admin-text)] text-sm">
                    {category.name}
                  </p>
                  <Badge className="mt-1" variant="secondary">
                    Active
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  onClick={() => handleEdit(category)}
                  size="sm"
                  variant="ghost"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => setDeleteDialog(category)}
                  size="sm"
                  variant="ghost"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        {activeCategories.length === 0 && (
          <div className="flex h-32 items-center justify-center rounded-lg border border-[var(--admin-border)] border-dashed">
            <p className="text-[var(--admin-text-muted)] text-sm">
              No active categories
            </p>
          </div>
        )}
      </div>

      {/* Inactive Categories */}
      {inactiveCategories.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-[var(--admin-text)] text-base">
            Hidden Categories
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inactiveCategories.map((category) => (
              <div
                className="group flex items-center justify-between rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-4 opacity-70 transition-all hover:border-[var(--admin-accent)]/30 hover:shadow-md"
                key={category._id}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--admin-bg)]">
                    <Tag className="h-4 w-4 text-[var(--admin-text-muted)]" />
                  </div>
                  <div>
                    <p className="font-medium text-[var(--admin-text)] text-sm">
                      {category.name}
                    </p>
                    <Badge className="mt-1" variant="outline">
                      Hidden
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    onClick={() => handleEdit(category)}
                    size="sm"
                    variant="ghost"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) {
            setCreateForm({ name: "", isActive: true });
          }
        }}
        open={createDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-[var(--admin-accent)]" />
              Create New Category
            </DialogTitle>
            <DialogDescription>
              Add a new category for organizing gestures
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Name</Label>
              <Input
                id="create-name"
                onChange={(e) =>
                  setCreateForm({ ...createForm, name: e.target.value })
                }
                placeholder="e.g., Greetings, Animals, Colors"
                value={createForm.name}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={createForm.isActive}
                id="create-active"
                onCheckedChange={(checked) =>
                  setCreateForm({ ...createForm, isActive: checked })
                }
              />
              <Label htmlFor="create-active">Active (visible to users)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setCreateDialogOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={createMutation.isPending}
              onClick={handleCreateSubmit}
            >
              {createMutation.isPending ? "Creating..." : "Create Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setEditDialog(null);
          }
        }}
        open={!!editDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-[var(--admin-accent)]" />
              Edit Category
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                placeholder="Category name"
                value={editForm.name}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editForm.isActive}
                id="edit-active"
                onCheckedChange={(checked) =>
                  setEditForm({ ...editForm, isActive: checked })
                }
              />
              <Label htmlFor="edit-active">Active (visible to users)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setEditDialog(null)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={updateMutation.isPending}
              onClick={handleEditSubmit}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDialog(null);
          }
        }}
        open={!!deleteDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-[var(--admin-error)]" />
              Delete Category
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteDialog?.name}"? This will
              hide the category from users.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDeleteDialog(null)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={deleteMutation.isPending}
              onClick={() =>
                deleteDialog && deleteMutation.mutate(deleteDialog._id)
              }
              variant="destructive"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
