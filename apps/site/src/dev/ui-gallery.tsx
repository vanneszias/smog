import { createI18n, type Locale } from "@smog/i18n";
import { I18nextProvider, useTranslation } from "@smog/i18n/react";
import {
  AlertDialog,
  Avatar,
  Badge,
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Chip,
  DataTable,
  type DataTableColumn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  EmptyState,
  ErrorState,
  Field,
  Heading,
  IconButton,
  Input,
  ListItem,
  Logo,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  OfflineBanner,
  Pagination,
  PortalContainerProvider,
  ProgressBar,
  RadioGroup,
  SearchField,
  SegmentedControl,
  Select,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetTrigger,
  Skeleton,
  Spinner,
  Stepper,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  Textarea,
  TextLink,
  Tooltip,
  useToast,
} from "@smog/ui-web";
import {
  ChevronRight,
  Copy,
  Ellipsis,
  Hand,
  Heart,
  LayoutGrid,
  List,
  Mail,
  Pencil,
  Plus,
  Settings,
  Share2,
  Trash,
} from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";

/*
 * `/dev/ui`: every kit component in every variant and size, light and dark
 * side by side. Section titles are the components' code names (identifiers,
 * not copy); every visible string comes from @smog/i18n.
 */

const noop = (): void => undefined;

const VARIANTS = ["primary", "secondary", "ghost", "danger"] as const;
const SIZES = ["sm", "md", "lg"] as const;
const BADGES = [
  "neutral",
  "primary",
  "accent",
  "success",
  "warning",
  "danger",
] as const;

/**
 * The gallery uses the app's providers (root layout); `lang` (`?lang=`)
 * overrides the page language for this subtree only.
 */
export function UiGallery({ lang }: { lang?: Locale | undefined }): ReactNode {
  const override = useMemo(() => (lang ? createI18n(lang) : null), [lang]);
  return override ? (
    <I18nextProvider i18n={override}>
      <GalleryPage />
    </I18nextProvider>
  ) : (
    <GalleryPage />
  );
}

function GalleryPage(): ReactNode {
  const { i18n, t } = useTranslation();
  return (
    <div
      className="mx-auto flex w-full flex-col gap-6 px-4 py-8 md:px-6 lg:px-8"
      lang={i18n.language}
    >
      <header className="flex flex-col gap-3">
        <Logo size="md" />
        <Heading level={1}>{t("devTools.componentGallery")}</Heading>
        <Text tone="muted">{t("devTools.gallery.intro")}</Text>
      </header>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <ThemeColumn theme="light" />
        <ThemeColumn theme="dark" />
      </div>
    </div>
  );
}

function ThemeColumn({ theme }: { theme: "light" | "dark" }): ReactNode {
  const { t } = useTranslation();
  // Overlays of the dark column portal into it, so they keep its variables.
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  return (
    <div className={theme === "dark" ? "dark min-w-0" : "min-w-0"}>
      <section
        aria-labelledby={`theme-${theme}`}
        className="flex min-w-0 flex-col gap-10 rounded-xl border border-border-subtle bg-background p-4 text-foreground sm:p-6"
        data-theme-column={theme}
      >
        <Heading id={`theme-${theme}`} level={2}>
          {t(`theme.${theme}`)}
        </Heading>
        <PortalContainerProvider container={portal}>
          <Showcase />
        </PortalContainerProvider>
        <div ref={setPortal} />
      </section>
    </div>
  );
}

function Section({
  children,
  name,
}: {
  children: ReactNode;
  name: string;
}): ReactNode {
  return (
    <section className="flex flex-col gap-4">
      <Heading level={3} tone="muted">
        {name}
      </Heading>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }): ReactNode {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function Showcase(): ReactNode {
  return (
    <>
      <ButtonsSection />
      <TypographySection />
      <BadgesAndChips />
      <FormsSection />
      <ChoiceSection />
      <SurfacesSection />
      <NavigationSection />
      <OverlaysSection />
      <StatesSection />
      <ProgressSection />
      <DataSection />
      <BrandSection />
    </>
  );
}

function ButtonsSection(): ReactNode {
  const { t } = useTranslation();
  const labels = {
    danger: t("common.delete"),
    ghost: t("common.edit"),
    primary: t("common.save"),
    secondary: t("common.cancel"),
  } as const;
  return (
    <>
      <Section name="Button">
        {SIZES.map((size) => (
          <Row key={size}>
            {VARIANTS.map((variant) => (
              <Button key={variant} size={size} variant={variant}>
                {labels[variant]}
              </Button>
            ))}
          </Row>
        ))}
        <Row>
          <Button icon={<Share2 />}>{t("common.share")}</Button>
          <Button loading>{t("common.saving")}</Button>
          <Button disabled variant="secondary">
            {t("common.next")}
          </Button>
          <Button asChild variant="ghost">
            <a href="#top">{t("common.learnMore")}</a>
          </Button>
        </Row>
      </Section>
      <Section name="IconButton">
        {SIZES.map((size) => (
          <Row key={size}>
            {VARIANTS.map((variant) => (
              <IconButton
                icon={variant === "danger" ? <Trash /> : <Heart />}
                key={variant}
                label={
                  variant === "danger" ? t("common.delete") : t("nav.favorites")
                }
                size={size}
                variant={variant}
              />
            ))}
            <IconButton
              icon={<Ellipsis />}
              label={t("a11y.moreActions")}
              loading
              size={size}
            />
          </Row>
        ))}
      </Section>
    </>
  );
}

function TypographySection(): ReactNode {
  const { t } = useTranslation();
  return (
    <Section name="Heading / Text / TextLink">
      <div className="flex flex-col gap-2">
        <Heading level={4} size="display">
          {t("common.appName")}
        </Heading>
        <Heading level={4} size="title-1">
          {t("devTools.gallery.sampleTitle")}
        </Heading>
        <Heading level={4} size="title-2">
          {t("devTools.gallery.sampleTitle")}
        </Heading>
        <Heading level={4} size="title-3">
          {t("devTools.gallery.sampleTitle")}
        </Heading>
        <Text>{t("devTools.gallery.sampleText")}</Text>
        <Text size="body-sm" tone="muted">
          {t("devTools.gallery.sampleText")}
        </Text>
        <Text size="caption" tone="muted">
          {t("devTools.gallery.sampleText")}
        </Text>
      </div>
      <Row>
        {(["primary", "success", "warning", "danger"] as const).map((tone) => (
          <Text key={tone} tone={tone} weight="semibold">
            {t("devTools.gallery.sampleTitle")}
          </Text>
        ))}
      </Row>
      <Row>
        {(["primary", "default", "muted"] as const).map((tone) => (
          <TextLink href="/privacy" key={tone} tone={tone}>
            {t("nav.privacy")}
          </TextLink>
        ))}
      </Row>
    </Section>
  );
}

function BadgesAndChips(): ReactNode {
  const { t } = useTranslation();
  const categories = [
    t("devTools.gallery.rowGreetings"),
    t("devTools.gallery.rowFood"),
    t("devTools.gallery.rowFeelings"),
  ];
  const [selected, setSelected] = useState<string[]>([categories[0] ?? ""]);
  const [removable, setRemovable] = useState(categories);
  const toggleCategory = useCallback((category: string, next: boolean) => {
    setSelected((all) =>
      next ? [...all, category] : all.filter((c) => c !== category)
    );
  }, []);
  const removeCategory = useCallback((category: string) => {
    setRemovable((all) => all.filter((c) => c !== category));
  }, []);
  return (
    <>
      <Section name="Badge">
        {(["sm", "md"] as const).map((size) => (
          <Row key={size}>
            {BADGES.map((variant) => (
              <Badge key={variant} size={size} variant={variant}>
                {variant === "success"
                  ? t("devTools.gallery.statusActive")
                  : t("devTools.gallery.statusDraft")}
              </Badge>
            ))}
          </Row>
        ))}
      </Section>
      <Section name="Chip">
        {(["sm", "md"] as const).map((size) => (
          <Row key={size}>
            {categories.map((category) => (
              <SelectableChip
                category={category}
                key={category}
                onToggle={toggleCategory}
                selected={selected.includes(category)}
                size={size}
              />
            ))}
          </Row>
        ))}
        <Row>
          {removable.map((category) => (
            <RemovableChip
              category={category}
              key={category}
              onRemove={removeCategory}
            />
          ))}
          <Chip disabled>{t("common.done")}</Chip>
        </Row>
      </Section>
    </>
  );
}

function FormsSection(): ReactNode {
  const { t } = useTranslation();
  const [name, setName] = useState(t("common.appName"));
  const handleName = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      setName(event.currentTarget.value),
    []
  );
  const languages = [
    { label: t("language.nl"), value: "nl" },
    { label: t("language.en"), value: "en" },
    { label: t("language.fr"), value: "fr" },
  ];
  return (
    <Section name="Field / Input / Textarea / SearchField / Select">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          hint={t("auth.checkInbox.spamHint")}
          label={t("auth.email.label")}
        >
          <Input
            leading={<Mail />}
            placeholder={t("auth.email.placeholder")}
            type="email"
          />
        </Field>
        <Field
          error={t("auth.errors.emailInvalid")}
          label={t("auth.email.label")}
          required
        >
          <Input defaultValue="sam@" type="email" />
        </Field>
        <Field label={t("auth.name.label")} optional>
          <Input placeholder={t("auth.name.placeholder")} size="lg" />
        </Field>
        <Field label={t("auth.password.label")}>
          <Input
            disabled
            placeholder={t("auth.password.placeholder")}
            type="password"
          />
        </Field>
        <Field label={t("language.label")}>
          <Select defaultValue="nl" options={languages} />
        </Field>
        <Field error={t("auth.errors.generic")} label={t("language.label")}>
          <Select options={languages} />
        </Field>
        <Field
          className="sm:col-span-2"
          counter={{ count: name.length, max: 35 }}
          label={t("auth.name.label")}
        >
          <Textarea onChange={handleName} rows={2} value={name} />
        </Field>
      </div>
      <SearchField defaultValue={t("devTools.gallery.rowGreetings")} />
      <SearchField size="lg" />
    </Section>
  );
}

function ChoiceSection(): ReactNode {
  const { t } = useTranslation();
  const [consent, setConsent] = useState(true);
  return (
    <Section name="Checkbox / Switch / RadioGroup">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col">
          <Checkbox defaultChecked label={t("auth.legal")} />
          <Checkbox
            description={t("auth.subtitle")}
            label={t("auth.continueAsGuest")}
          />
          <Checkbox checked="indeterminate" label={t("nav.lists")} />
          <Checkbox disabled label={t("nav.favorites")} />
        </div>
        <div className="flex flex-col">
          <Switch
            checked={consent}
            description={t("auth.subtitle")}
            label={t("nav.privacy")}
            onCheckedChange={setConsent}
          />
          <Switch label={t("theme.dark")} />
          <Switch disabled label={t("nav.settings")} />
        </div>
      </div>
      <Field label={t("theme.label")}>
        <RadioGroup
          defaultValue="system"
          options={[
            { label: t("theme.system"), value: "system" },
            { label: t("theme.light"), value: "light" },
            { disabled: true, label: t("theme.dark"), value: "dark" },
          ]}
          orientation="horizontal"
        />
      </Field>
    </Section>
  );
}

function SurfacesSection(): ReactNode {
  const { t } = useTranslation();
  return (
    <>
      <Section name="Card">
        <div className="grid gap-4 sm:grid-cols-2">
          {(["default", "raised", "sunken"] as const).map((variant) => (
            <Card key={variant} variant={variant}>
              <CardHeader>
                <CardTitle level={4}>
                  {t("devTools.gallery.sampleTitle")}
                </CardTitle>
                <CardDescription>
                  {t("devTools.gallery.sampleText")}
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Badge variant="primary">{variant}</Badge>
              </CardFooter>
            </Card>
          ))}
          <Card interactive tabIndex={0}>
            <CardHeader>
              <CardTitle level={4}>{t("devTools.gallery.rowFood")}</CardTitle>
              <CardDescription>
                {t("devTools.gallery.sampleText")}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </Section>
      <Section name="ListItem">
        <div className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle bg-surface">
          <ListItem
            description={t("devTools.gallery.sampleText")}
            leading={<Heart className="size-5" />}
            onClick={noop}
            title={t("nav.favorites")}
            trailing={<ChevronRight aria-hidden="true" className="size-5" />}
          />
          <ListItem
            leading={<Avatar name={t("common.appName")} size="sm" />}
            title={t("nav.account")}
            trailing={
              <Badge variant="success">
                {t("devTools.gallery.statusActive")}
              </Badge>
            }
          />
          <ListItem
            asChild
            leading={<Settings className="size-5" />}
            title={t("nav.settings")}
          >
            <a href="#top">{t("nav.settings")}</a>
          </ListItem>
        </div>
      </Section>
      <Section name="Avatar">
        <Row>
          {SIZES.map((size) => (
            <Avatar key={size} name={t("common.appName")} size={size} />
          ))}
          {SIZES.map((size) => (
            <Avatar
              key={`img-${size}`}
              name={t("common.appName")}
              size={size}
              src="/apple-touch-icon.png"
            />
          ))}
        </Row>
      </Section>
    </>
  );
}

function NavigationSection(): ReactNode {
  const { t } = useTranslation();
  const [view, setView] = useState("grid");
  return (
    <>
      <Section name="Tabs">
        <Tabs defaultValue="profile">
          <TabsList aria-label={t("nav.account")}>
            <TabsTrigger value="profile">{t("nav.account")}</TabsTrigger>
            <TabsTrigger value="privacy">{t("nav.privacy")}</TabsTrigger>
            <TabsTrigger value="settings">{t("nav.settings")}</TabsTrigger>
            <TabsTrigger disabled value="admin">
              {t("nav.admin")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="profile">
            <Text tone="muted">{t("auth.subtitle")}</Text>
          </TabsContent>
          <TabsContent value="privacy">
            <Text tone="muted">{t("auth.legal")}</Text>
          </TabsContent>
          <TabsContent value="settings">
            <Text tone="muted">{t("devTools.gallery.sampleText")}</Text>
          </TabsContent>
        </Tabs>
      </Section>
      <Section name="SegmentedControl">
        {(["sm", "md"] as const).map((size) => (
          <SegmentedControl
            aria-label={t("theme.label")}
            key={size}
            onValueChange={setView}
            options={[
              { icon: <LayoutGrid />, label: t("nav.browse"), value: "grid" },
              { icon: <List />, label: t("nav.lists"), value: "list" },
              { label: t("nav.favorites"), value: "favorites" },
            ]}
            size={size}
            value={view}
          />
        ))}
      </Section>
    </>
  );
}

function OverlaysSection(): ReactNode {
  const { t } = useTranslation();
  return (
    <Section name="Dialog / AlertDialog / Sheet / Menu / Tooltip / Toast">
      <Row>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">
              {t("devTools.gallery.openDialog")}
            </Button>
          </DialogTrigger>
          <DialogContent
            description={t("auth.import.description")}
            title={t("auth.import.title")}
          >
            <DialogFooter>
              <Button variant="secondary">{t("auth.import.skip")}</Button>
              <Button>{t("auth.import.confirm")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="secondary">
              {t("devTools.gallery.openSheet")}
            </Button>
          </SheetTrigger>
          <SheetContent
            description={t("devTools.gallery.sampleText")}
            title={t("devTools.gallery.sampleTitle")}
          >
            <SearchField />
            <SheetFooter>
              <Button>{t("common.done")}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
        <AlertDialog
          description={t("auth.import.failed")}
          onConfirm={noop}
          title={t("common.delete")}
          tone="danger"
        >
          <Button variant="danger">{t("common.delete")}</Button>
        </AlertDialog>
        <Menu>
          <MenuTrigger asChild>
            <IconButton
              icon={<Ellipsis />}
              label={t("a11y.moreActions")}
              variant="secondary"
            />
          </MenuTrigger>
          <MenuContent>
            <MenuLabel>{t("nav.lists")}</MenuLabel>
            <MenuItem icon={<Pencil />}>{t("common.edit")}</MenuItem>
            <MenuItem icon={<Share2 />}>{t("common.share")}</MenuItem>
            <MenuItem disabled icon={<Plus />}>
              {t("common.copy")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash />} variant="danger">
              {t("common.delete")}
            </MenuItem>
          </MenuContent>
        </Menu>
        <Tooltip content={t("common.copy")}>
          <IconButton
            icon={<Copy />}
            label={t("common.copy")}
            variant="secondary"
          />
        </Tooltip>
      </Row>
      <Row>
        {(["neutral", "success", "warning", "danger"] as const).map(
          (variant) => (
            <ToastDemo key={variant} variant={variant} />
          )
        )}
      </Row>
    </Section>
  );
}

function StatesSection(): ReactNode {
  const { t } = useTranslation();
  return (
    <Section name="Skeleton / EmptyState / ErrorState / OfflineBanner">
      <div aria-busy="true" className="flex items-center gap-3">
        <Skeleton shape="circle" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="w-2/3" />
          <Skeleton className="w-1/2" />
        </div>
      </div>
      <Skeleton shape="rect" />
      <Card>
        <EmptyState
          action={<Button icon={<Plus />}>{t("nav.browse")}</Button>}
          illustration
          level={4}
        />
      </Card>
      <Card>
        <EmptyState icon={<Heart />} level={4} title={t("nav.favorites")} />
      </Card>
      <Card>
        <ErrorState level={4} onRetry={noop} />
      </Card>
      <OfflineBanner online={false} />
    </Section>
  );
}

function ProgressSection(): ReactNode {
  const { t } = useTranslation();
  const steps = [
    { label: t("devTools.gallery.stepChoose") },
    { label: t("devTools.gallery.stepDetails") },
    { label: t("devTools.gallery.stepPay") },
  ];
  return (
    <Section name="Spinner / ProgressBar / Stepper">
      <Row>
        {SIZES.map((size) => (
          <Spinner className="text-primary" key={size} size={size} />
        ))}
      </Row>
      <div className="flex flex-col gap-3">
        <ProgressBar label={t("devTools.gallery.progressLabel")} value={0} />
        <ProgressBar label={t("devTools.gallery.progressLabel")} value={40} />
        <ProgressBar
          label={t("devTools.gallery.progressLabel")}
          tone="success"
          value={100}
        />
        <ProgressBar
          label={t("devTools.gallery.progressLabel")}
          tone="warning"
          value={70}
        />
        <ProgressBar
          label={t("devTools.gallery.progressLabel")}
          tone="danger"
          value={20}
        />
        <ProgressBar label={t("devTools.gallery.progressLabel")} />
      </div>
      <Stepper current={0} steps={steps} />
      <Stepper current={1} steps={steps} />
      <Stepper current={2} steps={steps} />
    </Section>
  );
}

function SelectableChip({
  category,
  onToggle,
  selected,
  size,
}: {
  category: string;
  onToggle: (category: string, next: boolean) => void;
  selected: boolean;
  size: "sm" | "md";
}): ReactNode {
  const handleChange = useCallback(
    (next: boolean) => onToggle(category, next),
    [category, onToggle]
  );
  return (
    <Chip onSelectedChange={handleChange} selected={selected} size={size}>
      {category}
    </Chip>
  );
}

function RemovableChip({
  category,
  onRemove,
}: {
  category: string;
  onRemove: (category: string) => void;
}): ReactNode {
  const handleRemove = useCallback(
    () => onRemove(category),
    [category, onRemove]
  );
  return (
    <Chip icon={<Hand />} onRemove={handleRemove}>
      {category}
    </Chip>
  );
}

function ToastDemo({
  variant,
}: {
  variant: "neutral" | "success" | "warning" | "danger";
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const show = useCallback(
    () =>
      toast({
        description: t("devTools.gallery.sampleText"),
        title: t("common.copied"),
        variant,
      }),
    [t, toast, variant]
  );
  return (
    <Button onClick={show} size="sm" variant="ghost">
      {t("devTools.gallery.showToast")} ({variant})
    </Button>
  );
}

const rowId = (row: CategoryRow): string => row.id;

interface CategoryRow {
  count: number;
  id: string;
  name: string;
  status: "active" | "draft";
}

function DataSection(): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [page, setPage] = useState(3);
  const openRow = useCallback(
    (row: CategoryRow) => toast({ title: row.name }),
    [toast]
  );
  const rows: CategoryRow[] = [
    {
      count: 42,
      id: "greetings",
      name: t("devTools.gallery.rowGreetings"),
      status: "active",
    },
    {
      count: 118,
      id: "food",
      name: t("devTools.gallery.rowFood"),
      status: "active",
    },
    {
      count: 9,
      id: "feelings",
      name: t("devTools.gallery.rowFeelings"),
      status: "draft",
    },
  ];
  const columns: DataTableColumn<CategoryRow>[] = [
    {
      cell: (row) => row.name,
      header: t("devTools.gallery.columnName"),
      id: "name",
      sortValue: (row) => row.name,
    },
    {
      cell: (row) => (
        <Badge variant={row.status === "active" ? "success" : "neutral"}>
          {row.status === "active"
            ? t("devTools.gallery.statusActive")
            : t("devTools.gallery.statusDraft")}
        </Badge>
      ),
      header: t("devTools.gallery.columnStatus"),
      id: "status",
    },
    {
      align: "end",
      cell: (row) => row.count,
      header: t("devTools.gallery.columnCount"),
      id: "count",
      sortValue: (row) => row.count,
    },
  ];
  return (
    <Section name="DataTable / Table / Pagination">
      <DataTable
        aria-label={t("devTools.gallery.columnName")}
        columns={columns}
        defaultSort={{ direction: "desc", id: "count" }}
        getRowId={rowId}
        onRowClick={openRow}
        rows={rows}
        stickyHeader
      />
      <DataTable
        aria-label={t("states.empty.title")}
        columns={columns}
        empty={t("states.empty.title")}
        getRowId={rowId}
        rows={[]}
      />
      <Pagination onPageChange={setPage} page={page} pageCount={12} />
    </Section>
  );
}

function BrandSection(): ReactNode {
  return (
    <Section name="Logo">
      <Row>
        {SIZES.map((size) => (
          <Logo key={size} size={size} />
        ))}
      </Row>
      <Row>
        <Logo size="lg" tone="foreground" variant="stacked" />
        <Logo size="lg" variant="stacked" />
      </Row>
    </Section>
  );
}
