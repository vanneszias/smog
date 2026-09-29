import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import type { ChangeEvent } from "react";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { client, orpc } from "@/utils/orpc";

interface Category {
  _creationTime: number;
  _id: string;
  isActive: boolean;
  name: string;
}

export function CategoriesManagement() {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialog, setEditDialog] = useState<Category | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<Category | null>(null);
  const [createForm, setCreateForm] = useState({
    isActive: true,
    name: "",
  });
  const [editForm, setEditForm] = useState({
    isActive: true,
    name: "",
  });

  const { data: categories, isLoading } = useQuery(
    orpc.admin.categories.listAll.queryOptions()
  );

  const createMutation = useMutation({
    mutationFn: (data: { name: string; isActive: boolean }) =>
      client.admin.categories.create(data),
    onError: (error) => {
      toast.error(`Failed to create category: ${error.message}`);
    },
    onSuccess: () => {
      toast.success("Category created successfully");
      setCreateDialogOpen(false);
      setCreateForm({ isActive: true, name: "" });
      queryClient.invalidateQueries({
        queryKey: orpc.admin.categories.listAll.queryOptions().queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: orpc.categories.list.queryOptions().queryKey,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: {
      categoryId: string;
      name?: string;
      isActive?: boolean;
    }) => client.admin.categories.update(data),
    onError: (error) => {
      toast.error(`Failed to update category: ${error.message}`);
    },
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
  });

  const deleteMutation = useMutation({
    mutationFn: (categoryId: string) =>
      client.admin.categories.delete({ categoryId }),
    onError: (error) => {
      toast.error(`Failed to delete category: ${error.message}`);
    },
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
  });

  const handleEdit = useCallback((category: Category): void => {
    setEditDialog(category);
    setEditForm({
      isActive: category.isActive,
      name: category.name,
    });
  }, []);

  const handleOpenCreate = useCallback((): void => {
    setCreateDialogOpen(true);
  }, []);

  const handleCloseCreate = useCallback((): void => {
    setCreateDialogOpen(false);
  }, []);

  const handleCreateOpenChange = useCallback((open: boolean): void => {
    setCreateDialogOpen(open);
    if (!open) {
      setCreateForm({ isActive: true, name: "" });
    }
  }, []);

  const handleCreateNameChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      setCreateForm({ ...createForm, name: e.target.value });
    },
    [createForm]
  );

  const handleCreateActiveChange = useCallback(
    (checked: boolean): void => {
      setCreateForm({ ...createForm, isActive: checked });
    },
    [createForm]
  );

  const handleEditOpenChange = useCallback((open: boolean): void => {
    if (!open) {
      setEditDialog(null);
    }
  }, []);

  const handleCloseEdit = useCallback((): void => {
    setEditDialog(null);
  }, []);

  const handleEditNameChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      setEditForm({ ...editForm, name: e.target.value });
    },
    [editForm]
  );

  const handleEditActiveChange = useCallback(
    (checked: boolean): void => {
      setEditForm({ ...editForm, isActive: checked });
    },
    [editForm]
  );

  const handleDeleteOpenChange = useCallback((open: boolean): void => {
    if (!open) {
      setDeleteDialog(null);
    }
  }, []);

  const handleCloseDelete = useCallback((): void => {
    setDeleteDialog(null);
  }, []);

  const { mutate: deleteCategory } = deleteMutation;
  const handleConfirmDelete = useCallback((): void => {
    if (deleteDialog) {
      deleteCategory(deleteDialog._id);
    }
  }, [deleteDialog, deleteCategory]);

  const { mutate: createCategory } = createMutation;
  const handleCreateSubmit = useCallback((): void => {
    if (!createForm.name.trim()) {
      toast.error("Please enter a category name");
      return;
    }
    createCategory(createForm);
  }, [createForm, createCategory]);

  const { mutate: updateCategory } = updateMutation;
  const handleEditSubmit = useCallback((): void => {
    if (!editDialog) {
      return;
    }
    if (!editForm.name.trim()) {
      toast.error("Please enter a category name");
      return;
    }
    updateCategory({
      categoryId: editDialog._id,
      isActive: editForm.isActive,
      name: editForm.name,
    });
  }, [editDialog, editForm, updateCategory]);

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

        <Button onClick={handleOpenCreate}>
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
              <CategoryActions
                category={category}
                onDelete={setDeleteDialog}
                onEdit={handleEdit}
              />
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
                <CategoryActions category={category} onEdit={handleEdit} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog onOpenChange={handleCreateOpenChange} open={createDialogOpen}>
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
                onChange={handleCreateNameChange}
                placeholder="e.g., Greetings, Animals, Colors"
                value={createForm.name}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={createForm.isActive}
                id="create-active"
                onCheckedChange={handleCreateActiveChange}
              />
              <Label htmlFor="create-active">Active (visible to users)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCloseCreate} variant="outline">
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
      <Dialog onOpenChange={handleEditOpenChange} open={!!editDialog}>
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
                onChange={handleEditNameChange}
                placeholder="Category name"
                value={editForm.name}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editForm.isActive}
                id="edit-active"
                onCheckedChange={handleEditActiveChange}
              />
              <Label htmlFor="edit-active">Active (visible to users)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCloseEdit} variant="outline">
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
      <Dialog onOpenChange={handleDeleteOpenChange} open={!!deleteDialog}>
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
            <Button onClick={handleCloseDelete} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={deleteMutation.isPending}
              onClick={handleConfirmDelete}
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

interface CategoryActionsProps {
  category: Category;
  onDelete?: (category: Category) => void;
  onEdit: (category: Category) => void;
}

/** Edit (and optionally delete) buttons for a category card. */
function CategoryActions({ category, onDelete, onEdit }: CategoryActionsProps) {
  const handleEdit = useCallback((): void => {
    onEdit(category);
  }, [category, onEdit]);

  const handleDelete = useCallback((): void => {
    onDelete?.(category);
  }, [category, onDelete]);

  return (
    <div className="flex items-center gap-1">
      <Button onClick={handleEdit} size="sm" variant="ghost">
        <Pencil className="h-4 w-4" />
      </Button>
      {onDelete ? (
        <Button onClick={handleDelete} size="sm" variant="ghost">
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
