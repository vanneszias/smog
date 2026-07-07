import type { ComponentType } from "react";

export interface ListRecord {
  _id: string;
  name: string;
  description?: string;
  visibility: "private" | "shared";
  allowSharedEditing: boolean;
  isDefaultFavorites: boolean;
  viewShareToken?: string;
  editShareToken?: string;
}

export interface SharedListRecord {
  _id: string;
  name: string;
  description?: string;
  allowSharedEditing: boolean;
  canEdit: boolean;
}

export interface GestureRowAction {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
}
