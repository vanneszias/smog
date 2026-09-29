import type { ComponentType } from "react";

export interface ListRecord {
  _id: string;
  allowSharedEditing: boolean;
  description?: string;
  editShareToken?: string;
  isDefaultFavorites: boolean;
  name: string;
  viewShareToken?: string;
  visibility: "private" | "shared";
}

export interface SharedListRecord {
  _id: string;
  allowSharedEditing: boolean;
  canEdit: boolean;
  description?: string;
  name: string;
}

export interface GestureRowAction {
  disabled?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
}
