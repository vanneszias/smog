import {
  CheckCircle,
  ChevronRight,
  Gift,
  Loader2,
  Mail,
  RefreshCw,
  ShoppingCart,
  Star,
  Timer,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";

// =============================================================================
// Template definitions
// =============================================================================

type TemplateId =
  | "welcome"
  | "sponsorship_submitted"
  | "payment_confirmed"
  | "sponsorship_live"
  | "renewal_reminder";

interface TemplateInfo {
  id: TemplateId;
  label: string;
  subject: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
}

const TEMPLATES: TemplateInfo[] = [
  {
    id: "welcome",
    label: "Welkom",
    subject: "Welkom bij SMOG!",
    description: "Verstuurd na eerste aanmelding",
    icon: Star,
    iconColor: "#00805f",
  },
  {
    id: "sponsorship_submitted",
    label: "Sponsoring ontvangen",
    subject: "We hebben je sponsoring ontvangen",
    description: "Bevestiging van ingediende sponsoring",
    icon: Gift,
    iconColor: "#7c3aed",
  },
  {
    id: "payment_confirmed",
    label: "Betaling bevestigd",
    subject: "Betaling bevestigd — bedankt!",
    description: "Ontvangstbewijs na succesvolle betaling",
    icon: ShoppingCart,
    iconColor: "#0891b2",
  },
  {
    id: "sponsorship_live",
    label: "Sponsoring live",
    subject: "Je sponsoring is nu live!",
    description: "Verstuurd na goedkeuring door admin",
    icon: Zap,
    iconColor: "#16a34a",
  },
  {
    id: "renewal_reminder",
    label: "Verlengingsherinnering",
    subject: "Je SMOG-sponsoring verloopt binnenkort",
    description: "30 dagen voor vervaldatum",
    icon: Timer,
    iconColor: "#d97706",
  },
];

// =============================================================================
// Component
// =============================================================================

type PreviewMode = "desktop" | "mobile";

export function EmailPreview() {
  const serverUrl = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3000";
  const { getAccessToken } = useAuth();

  const [selected, setSelected] = useState<TemplateId>("welcome");
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<PreviewMode>("desktop");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const fetchPreview = useCallback(
    async (templateId: TemplateId) => {
      setLoading(true);
      setError(null);
      try {
        const token = await getAccessToken();
        if (!token) {
          throw new Error("Geen geldige sessie gevonden");
        }

        const res = await fetch(
          `${serverUrl}/api/email/preview/${templateId}`,
          {
            credentials: "include",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (!res.ok) {
          throw new Error(`Server antwoordde met ${res.status}`);
        }
        const text = await res.text();
        setHtml(text);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Onbekende fout opgetreden"
        );
      } finally {
        setLoading(false);
      }
    },
    [getAccessToken]
  );

  // Fetch on mount and when selection changes
  useEffect(() => {
    fetchPreview(selected);
  }, [selected, fetchPreview]);

  const activeTemplate = TEMPLATES.find((t) => t.id === selected)!;

  return (
    <div
      className="flex h-full gap-0"
      style={{ minHeight: "calc(100vh - 260px)" }}
    >
      {/* ── Sidebar ── */}
      <aside
        className="flex shrink-0 flex-col border-[var(--admin-border)] border-r"
        style={{ width: "260px" }}
      >
        <div className="border-[var(--admin-border)] border-b px-4 py-3">
          <p className="font-medium text-[var(--admin-text)] text-sm">
            E-mailsjablonen
          </p>
          <p className="mt-0.5 text-[var(--admin-text-muted)] text-xs">
            {TEMPLATES.length} sjablonen
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {TEMPLATES.map((tpl) => {
            const Icon = tpl.icon;
            const isActive = selected === tpl.id;

            return (
              <button
                className={`group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
                  isActive
                    ? "bg-[var(--admin-accent)]/10"
                    : "hover:bg-[var(--admin-hover)]"
                }`}
                key={tpl.id}
                onClick={() => setSelected(tpl.id)}
                type="button"
              >
                <div
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                  style={{
                    backgroundColor: isActive
                      ? `${tpl.iconColor}20`
                      : "var(--admin-icon-bg)",
                  }}
                >
                  <Icon
                    className="h-3.5 w-3.5"
                    style={{
                      color: isActive
                        ? tpl.iconColor
                        : "var(--admin-text-muted)",
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate font-medium text-sm ${
                      isActive
                        ? "text-[var(--admin-accent)]"
                        : "text-[var(--admin-text)]"
                    }`}
                  >
                    {tpl.label}
                  </p>
                  <p className="truncate text-[var(--admin-text-muted)] text-xs">
                    {tpl.description}
                  </p>
                </div>
                {isActive && (
                  <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--admin-accent)]" />
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── Preview panel ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-[var(--admin-border)] border-b px-5 py-3">
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-[var(--admin-accent)]" />
            <div>
              <p className="font-medium text-[var(--admin-text)] text-sm leading-tight">
                {activeTemplate.label}
              </p>
              <p className="text-[var(--admin-text-muted)] text-xs">
                Onderwerp: {activeTemplate.subject}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Desktop / Mobile toggle */}
            <div className="flex rounded-lg border border-[var(--admin-border)] bg-[var(--admin-bg)] p-0.5">
              {(["desktop", "mobile"] as PreviewMode[]).map((m) => (
                <button
                  className={`rounded-md px-3 py-1 font-medium text-xs transition-all ${
                    mode === m
                      ? "bg-[var(--admin-accent)] text-white shadow-sm"
                      : "text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]"
                  }`}
                  key={m}
                  onClick={() => setMode(m)}
                  type="button"
                >
                  {m === "desktop" ? "Desktop" : "Mobiel"}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button
              className="flex items-center gap-1.5 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-bg)] px-3 py-1.5 text-[var(--admin-text-secondary)] text-xs transition-colors hover:bg-[var(--admin-hover)] hover:text-[var(--admin-text)] disabled:opacity-50"
              disabled={loading}
              onClick={() => fetchPreview(selected)}
              type="button"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Verversen
            </button>
          </div>
        </div>

        {/* Render area */}
        <div
          className="flex flex-1 items-start justify-center overflow-auto p-6"
          style={{ backgroundColor: "var(--admin-bg)" }}
        >
          {loading && !html && (
            <div className="flex flex-col items-center gap-3 pt-24 text-[var(--admin-text-muted)]">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--admin-accent)]" />
              <p className="text-sm">Sjabloon laden…</p>
            </div>
          )}

          {error && (
            <div className="mt-16 flex max-w-sm flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-950/30">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
                <Mail className="h-5 w-5 text-red-500" />
              </div>
              <p className="font-medium text-red-700 text-sm dark:text-red-400">
                Laden mislukt
              </p>
              <p className="text-red-600 text-xs dark:text-red-500">{error}</p>
              <button
                className="mt-1 rounded-lg bg-red-600 px-4 py-1.5 font-medium text-white text-xs hover:bg-red-700"
                onClick={() => fetchPreview(selected)}
                type="button"
              >
                Opnieuw proberen
              </button>
            </div>
          )}

          {html && !error && (
            <div
              className="relative transition-all duration-300"
              style={{
                width: mode === "mobile" ? "390px" : "100%",
                maxWidth: mode === "desktop" ? "780px" : "390px",
              }}
            >
              {/* Loading overlay */}
              {loading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[var(--admin-bg)]/70 backdrop-blur-sm">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--admin-accent)]" />
                </div>
              )}

              {/* Status badge */}
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="flex items-center gap-1.5 rounded-full bg-[var(--admin-accent-light)] px-2.5 py-1 font-medium text-[var(--admin-accent)] text-xs">
                  <CheckCircle className="h-3 w-3" />
                  Voorbeeldweergave
                </span>
                <span className="text-[var(--admin-text-muted)] text-xs">
                  {mode === "mobile" ? "390px breed" : "Tot 780px breed"}
                </span>
              </div>

              {/* iframe */}
              <iframe
                className="w-full rounded-xl border border-[var(--admin-border)] bg-white shadow-sm"
                ref={iframeRef}
                sandbox="allow-same-origin"
                srcDoc={html}
                style={{
                  height: "700px",
                  colorScheme: "light",
                }}
                title={`E-mailvoorbeeld: ${activeTemplate.label}`}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
