import { useTranslation } from "@smog/i18n/react";
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
  Dialog,
  DialogClose,
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
  ProgressBar,
  RadioGroup,
  SearchField,
  SegmentedControl,
  Select,
  Sheet,
  SheetClose,
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
  useColor,
  useToast,
} from "@smog/ui-native";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import Hand from "lucide-react-native/icons/hand";
import Heart from "lucide-react-native/icons/heart";
import LayoutGrid from "lucide-react-native/icons/layout-grid";
import List from "lucide-react-native/icons/list";
import Mail from "lucide-react-native/icons/mail";
import Pencil from "lucide-react-native/icons/pencil";
import Plus from "lucide-react-native/icons/plus";
import Settings from "lucide-react-native/icons/settings";
import Share2 from "lucide-react-native/icons/share-2";
import Trash from "lucide-react-native/icons/trash";
import { useColorScheme } from "nativewind";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useState,
} from "react";
import { ScrollView, View } from "react-native";

/*
 * Settings → Developer tools → Component gallery: every kit component in
 * every variant and size, with a theme toggle (the web's `/dev/ui`). Section
 * titles are the components' code names (identifiers, not copy); every
 * visible string comes from @smog/i18n.
 */

const noop = (): void => undefined;

/**
 * The gallery's test id, unique in the app: the mobile release check fails a
 * production bundle that contains it (the gallery must be compiled out).
 */
const GALLERY_MARKER = "smog-dev-component-gallery";

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
const THEMES = ["system", "light", "dark"] as const;
type ThemeChoice = (typeof THEMES)[number];

function isThemeChoice(value: string): value is ThemeChoice {
  return (THEMES as readonly string[]).includes(value);
}

export function ComponentGallery(): ReactElement {
  const { t } = useTranslation();
  return (
    <ScrollView
      contentContainerClassName="flex-col gap-10 px-4 py-6"
      testID={GALLERY_MARKER}
    >
      <View className="flex-col gap-3">
        <Logo size="md" />
        <Heading level={1}>{t("devTools.componentGallery")}</Heading>
        <Text tone="muted">{t("devTools.gallery.intro")}</Text>
        <ThemeToggle />
      </View>
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
      <BrandSection />
    </ScrollView>
  );
}

function ThemeToggle(): ReactElement {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const { setColorScheme } = useColorScheme();
  const change = useCallback(
    (next: string): void => {
      if (isThemeChoice(next)) {
        setChoice(next);
        setColorScheme(next);
      }
    },
    [setColorScheme]
  );
  return (
    <SegmentedControl
      aria-label={t("theme.label")}
      onValueChange={change}
      options={THEMES.map((theme) => ({
        label: t(`theme.${theme}`),
        value: theme,
      }))}
      value={choice}
    />
  );
}

function Section({
  children,
  name,
}: {
  children: ReactNode;
  name: string;
}): ReactElement {
  return (
    <View className="flex-col gap-4">
      <Heading level={3} tone="muted">
        {name}
      </Heading>
      {children}
    </View>
  );
}

function Row({ children }: { children: ReactNode }): ReactElement {
  return (
    <View className="flex-row flex-wrap items-center gap-3">{children}</View>
  );
}

function ButtonsSection(): ReactElement {
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

function TypographySection(): ReactElement {
  const { t } = useTranslation();
  return (
    <Section name="Heading / Text">
      <View className="flex-col gap-2">
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
      </View>
      <Row>
        {(["primary", "success", "warning", "danger"] as const).map((tone) => (
          <Text key={tone} tone={tone} weight="semibold">
            {t("devTools.gallery.sampleTitle")}
          </Text>
        ))}
      </Row>
      <Row>
        {(["primary", "default", "muted"] as const).map((tone) => (
          <TextLink key={tone} onPress={noop} tone={tone}>
            {t("nav.privacy")}
          </TextLink>
        ))}
      </Row>
    </Section>
  );
}

function BadgesAndChips(): ReactElement {
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

function FormsSection(): ReactElement {
  const { t } = useTranslation();
  const [name, setName] = useState(t("common.appName"));
  const languages = [
    { label: t("language.nl"), value: "nl" },
    { label: t("language.en"), value: "en" },
    { label: t("language.fr"), value: "fr" },
  ];
  return (
    <Section name="Field / Input / Textarea / SearchField / Select">
      <Field hint={t("auth.checkInbox.spamHint")} label={t("auth.email.label")}>
        <Input
          keyboardType="email-address"
          leading={<Mail />}
          placeholder={t("auth.email.placeholder")}
        />
      </Field>
      <Field
        error={t("auth.errors.emailInvalid")}
        label={t("auth.email.label")}
        required
      >
        <Input defaultValue="sam@" keyboardType="email-address" />
      </Field>
      <Field label={t("auth.name.label")} optional>
        <Input placeholder={t("auth.name.placeholder")} size="lg" />
      </Field>
      <Field label={t("auth.password.label")}>
        <Input
          disabled
          placeholder={t("auth.password.placeholder")}
          secureTextEntry
        />
      </Field>
      <Field label={t("language.label")}>
        <Select defaultValue="nl" options={languages} />
      </Field>
      <Field error={t("auth.errors.generic")} label={t("language.label")}>
        <Select options={languages} />
      </Field>
      <Field
        counter={{ count: name.length, max: 35 }}
        label={t("auth.name.label")}
      >
        <Textarea onChangeText={setName} rows={2} value={name} />
      </Field>
      <SearchField defaultValue={t("devTools.gallery.rowGreetings")} />
      <SearchField size="lg" />
    </Section>
  );
}

function ChoiceSection(): ReactElement {
  const { t } = useTranslation();
  const [consent, setConsent] = useState(true);
  return (
    <Section name="Checkbox / Switch / RadioGroup">
      <View className="flex-col">
        <Checkbox defaultChecked label={t("auth.legal")} />
        <Checkbox
          description={t("auth.subtitle")}
          label={t("auth.continueAsGuest")}
        />
        <Checkbox checked="indeterminate" label={t("nav.lists")} />
        <Checkbox disabled label={t("nav.favorites")} />
      </View>
      <View className="flex-col">
        <Switch
          checked={consent}
          description={t("auth.subtitle")}
          label={t("nav.privacy")}
          onCheckedChange={setConsent}
        />
        <Switch label={t("theme.dark")} />
        <Switch disabled label={t("nav.settings")} />
      </View>
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

function SurfacesSection(): ReactElement {
  const { t } = useTranslation();
  const muted = useColor("foregroundMuted");
  return (
    <>
      <Section name="Card">
        {(["default", "raised", "sunken"] as const).map((variant) => (
          <Card key={variant} variant={variant}>
            <CardHeader>
              <CardTitle>{t("devTools.gallery.sampleTitle")}</CardTitle>
              <CardDescription>
                {t("devTools.gallery.sampleText")}
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Badge variant="primary">{variant}</Badge>
            </CardFooter>
          </Card>
        ))}
        <Card
          accessibilityLabel={t("devTools.gallery.rowFood")}
          onPress={noop}
          variant="raised"
        >
          <CardHeader>
            <CardTitle>{t("devTools.gallery.rowFood")}</CardTitle>
            <CardDescription>
              {t("devTools.gallery.sampleText")}
            </CardDescription>
          </CardHeader>
        </Card>
      </Section>
      <Section name="ListItem">
        <View className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
          <ListItem
            description={t("devTools.gallery.sampleText")}
            leading={<Heart color={muted} />}
            onPress={noop}
            title={t("nav.favorites")}
            trailing={<ChevronRight color={muted} />}
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
            disabled
            leading={<Settings color={muted} />}
            onPress={noop}
            title={t("nav.settings")}
          />
        </View>
      </Section>
      <Section name="Avatar">
        <Row>
          {SIZES.map((size) => (
            <Avatar key={size} name={t("common.appName")} size={size} />
          ))}
        </Row>
      </Section>
    </>
  );
}

function NavigationSection(): ReactElement {
  const { t } = useTranslation();
  const [view, setView] = useState("grid");
  return (
    <>
      <Section name="Tabs">
        <Tabs defaultValue="profile">
          <TabsList aria-label={t("nav.account")}>
            <TabsTrigger value="profile">{t("nav.account")}</TabsTrigger>
            <TabsTrigger value="privacy">{t("nav.privacy")}</TabsTrigger>
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
        </Tabs>
      </Section>
      <Section name="SegmentedControl">
        {(["sm", "md"] as const).map((size) => (
          <SegmentedControl
            aria-label={t("nav.browse")}
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

function OverlaysSection(): ReactElement {
  const { t } = useTranslation();
  return (
    <Section name="Dialog / AlertDialog / Sheet / Menu / Toast">
      <Row>
        <Dialog>
          <DialogTrigger>
            <Button variant="secondary">
              {t("devTools.gallery.openDialog")}
            </Button>
          </DialogTrigger>
          <DialogContent
            description={t("auth.import.description")}
            title={t("auth.import.title")}
          >
            <DialogFooter>
              <DialogClose>
                <Button>{t("auth.import.confirm")}</Button>
              </DialogClose>
              <DialogClose>
                <Button variant="secondary">{t("auth.import.skip")}</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Sheet>
          <SheetTrigger>
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
              <SheetClose>
                <Button>{t("common.done")}</Button>
              </SheetClose>
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
          <MenuTrigger>
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

function StatesSection(): ReactElement {
  const { t } = useTranslation();
  return (
    <Section name="Skeleton / EmptyState / ErrorState / OfflineBanner">
      <View
        accessibilityState={{ busy: true }}
        className="flex-row items-center gap-3"
      >
        <Skeleton shape="circle" />
        <View className="flex-1 flex-col gap-2">
          <Skeleton className="w-2/3" shape="text" />
          <Skeleton className="w-1/2" shape="text" />
        </View>
      </View>
      <Skeleton shape="rect" />
      <Card>
        <EmptyState
          action={<Button icon={<Plus />}>{t("nav.browse")}</Button>}
          illustration
        />
      </Card>
      <Card>
        <EmptyState icon={<Heart />} title={t("nav.favorites")} />
      </Card>
      <Card>
        <ErrorState onRetry={noop} />
      </Card>
      <OfflineBanner online={false} />
    </Section>
  );
}

function ProgressSection(): ReactElement {
  const { t } = useTranslation();
  const steps = [
    { label: t("devTools.gallery.stepChoose") },
    { label: t("devTools.gallery.stepDetails") },
    { label: t("devTools.gallery.stepPay") },
  ];
  const label = t("devTools.gallery.progressLabel");
  return (
    <Section name="Spinner / ProgressBar / Stepper">
      <Row>
        {SIZES.map((size) => (
          <Spinner key={size} size={size} />
        ))}
      </Row>
      <View className="flex-col gap-3">
        <ProgressBar label={label} value={0} />
        <ProgressBar label={label} value={40} />
        <ProgressBar label={label} tone="success" value={100} />
        <ProgressBar label={label} tone="warning" value={70} />
        <ProgressBar label={label} tone="danger" value={20} />
        <ProgressBar label={label} />
      </View>
      <Stepper current={0} steps={steps} />
      <Stepper current={1} steps={steps} />
      <Stepper current={2} steps={steps} />
    </Section>
  );
}

function BrandSection(): ReactElement {
  return (
    <Section name="Logo">
      <Row>
        {SIZES.map((size) => (
          <Logo key={size} size={size} />
        ))}
      </Row>
      <Row>
        <Logo size="lg" tone="foreground" variant="stacked" />
        <Logo color="primaryStrong" decorative size="md" tone="current" />
      </Row>
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
}): ReactElement {
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
}): ReactElement {
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
}): ReactElement {
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
    <Button onPress={show} size="sm" variant="ghost">
      {`${t("devTools.gallery.showToast")} (${variant})`}
    </Button>
  );
}
