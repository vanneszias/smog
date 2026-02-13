import { Clock, Hand, Settings, Sparkles, Tag, Users } from "lucide-react";
import { useState } from "react";
import { CategoriesManagement } from "./CategoriesManagement";
import { GesturesManagement } from "./GesturesManagement";
import { PendingSponsorships } from "./PendingSponsorships";
import { SponsorshipsManagement } from "./SponsorshipsManagement";

export interface AdminDashboardProps {
  user: {
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

type TabValue = "pending" | "sponsorships" | "gestures" | "categories";

const navigation: Array<{
  id: TabValue;
  label: string;
  icon: React.ElementType;
  description: string;
}> = [
  {
    id: "pending",
    label: "Pending Review",
    icon: Clock,
    description: "Sponsorships awaiting approval",
  },
  {
    id: "sponsorships",
    label: "Sponsorships",
    icon: Users,
    description: "All sponsorship records",
  },
  {
    id: "gestures",
    label: "Gestures",
    icon: Hand,
    description: "Gesture library management",
  },
  {
    id: "categories",
    label: "Categories",
    icon: Tag,
    description: "Manage gesture categories",
  },
];

export function AdminDashboard({ user }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabValue>("pending");

  const activeNav = navigation.find((n) => n.id === activeTab);

  return (
    <div className="admin-dashboard flex min-h-screen bg-[var(--admin-bg)]">
      {/* Sidebar */}
      <aside className="admin-sidebar sticky top-0 flex h-screen w-72 shrink-0 flex-col border-[var(--admin-border)] border-r bg-[var(--admin-sidebar)]">
        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3">
          <div className="mb-3 px-3 font-medium text-[11px] text-[var(--admin-text-muted)] uppercase tracking-wider">
            Management
          </div>
          {navigation.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;

            return (
              <button
                className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200 ${
                  isActive
                    ? "bg-[var(--admin-accent)]/10 text-[var(--admin-accent)]"
                    : "text-[var(--admin-text-secondary)] hover:bg-[var(--admin-hover)] hover:text-[var(--admin-text)]"
                }`}
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                type="button"
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                    isActive
                      ? "bg-[var(--admin-accent)] text-white"
                      : "bg-[var(--admin-icon-bg)] text-[var(--admin-text-muted)] group-hover:bg-[var(--admin-accent)]/20 group-hover:text-[var(--admin-accent)]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm">{item.label}</div>
                  <div
                    className={`text-xs ${isActive ? "text-[var(--admin-accent)]/70" : "text-[var(--admin-text-muted)]"}`}
                  >
                    {item.description}
                  </div>
                </div>
                {isActive && (
                  <div className="h-2 w-2 rounded-full bg-[var(--admin-accent)]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="border-[var(--admin-border)] border-t p-4">
          <div className="flex items-center gap-3 rounded-lg bg-[var(--admin-card)] p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--admin-accent)] to-[var(--admin-accent-dark)] font-semibold text-sm text-white">
              {user.firstName?.[0] || user.email[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-[var(--admin-text)] text-sm">
                {user.firstName || "Admin"}
              </p>
              <p className="truncate text-[var(--admin-text-muted)] text-xs">
                {user.email}
              </p>
            </div>
            <button
              className="rounded-lg p-2 text-[var(--admin-text-muted)] transition-colors hover:bg-[var(--admin-hover)] hover:text-[var(--admin-text)]"
              type="button"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 border-[var(--admin-border)] border-b bg-[var(--admin-bg)]/95 px-8 py-6 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2">
                {activeNav && (
                  <activeNav.icon className="h-5 w-5 text-[var(--admin-accent)]" />
                )}
                <h2 className="font-semibold text-2xl text-[var(--admin-text)] tracking-tight">
                  {activeNav?.label}
                </h2>
              </div>
              <p className="text-[var(--admin-text-secondary)] text-sm">
                {activeNav?.description}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-full bg-[var(--admin-card)] px-4 py-2 text-sm shadow-sm">
                <Sparkles className="h-4 w-4 text-[var(--admin-accent)]" />
                <span className="text-[var(--admin-text-secondary)]">
                  Welcome back,{" "}
                  <span className="font-medium text-[var(--admin-text)]">
                    {user.firstName || "Admin"}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 p-8">
          <div className="admin-content-card rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card)] p-6 shadow-sm">
            {activeTab === "pending" && <PendingSponsorships />}
            {activeTab === "sponsorships" && <SponsorshipsManagement />}
            {activeTab === "gestures" && <GesturesManagement />}
            {activeTab === "categories" && <CategoriesManagement />}
          </div>
        </div>
      </main>

      {/* Admin-specific CSS variables */}
      <style>
        {`
          .admin-dashboard {
            --admin-bg: #f8faf8;
            --admin-sidebar: #ffffff;
            --admin-card: #ffffff;
            --admin-border: #e8ece8;
            --admin-hover: #f3f6f3;
            --admin-icon-bg: #f0f4f0;
            --admin-accent: #00805f;
            --admin-accent-dark: #006b4f;
            --admin-accent-light: #e6f4ef;
            --admin-success: #22c55e;
            --admin-warning: #f59e0b;
            --admin-error: #ef4444;
            --admin-text: #1a2e1a;
            --admin-text-secondary: #4a5f4a;
            --admin-text-muted: #7a8f7a;
          }

          .dark .admin-dashboard {
            --admin-bg: #0f1410;
            --admin-sidebar: #161b17;
            --admin-card: #1a201b;
            --admin-border: #2a352b;
            --admin-hover: #222b23;
            --admin-icon-bg: #242e25;
            --admin-accent: #00a077;
            --admin-accent-dark: #008563;
            --admin-accent-light: #002e22;
            --admin-text: #e8f0e8;
            --admin-text-secondary: #b0c4b0;
            --admin-text-muted: #6a806a;
          }

          .admin-content-card {
            min-height: calc(100vh - 280px);
          }

          /* Subtle background pattern */
          .admin-dashboard::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-image: radial-gradient(circle at 1px 1px, var(--admin-border) 1px, transparent 0);
            background-size: 24px 24px;
            opacity: 0.4;
            pointer-events: none;
            z-index: 0;
          }

          .admin-sidebar,
          .admin-dashboard main {
            position: relative;
            z-index: 1;
          }
        `}
      </style>
    </div>
  );
}
