import { useTranslation } from "@smog/i18n/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
  AspectRatio,
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  IconButton,
  Input,
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
  Label,
  ScrollArea,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
  useZodForm,
} from "@smog/ui-web";
import {
  Bold,
  Heart,
  Italic,
  LayoutGrid,
  List,
  Settings,
  Underline,
  X,
} from "lucide-react";
import {
  type ComponentProps,
  type ComponentType,
  lazy,
  type ReactElement,
  type ReactNode,
  Suspense,
  useCallback,
  useState,
} from "react";
import { z } from "zod";

/*
 * `/dev/ui`: the registry components (shadcn, ported into `@smog/ui-web`),
 * light and dark, the green surfaces included. Section titles are code
 * names; every visible string comes from `@smog/i18n`.
 */

/** `command` and `carousel` are separate entry points: they load on demand. */
const CommandDemo = lazy(() => import("./ui-gallery-command"));
const CarouselDemo = lazy(() => import("./ui-gallery-carousel"));

function Section({
  children,
  name,
}: {
  children: ReactNode;
  name: string;
}): ReactNode {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="font-medium text-body-sm text-muted-foreground">{name}</h3>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }): ReactNode {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function Lazy({ Demo }: { Demo: ComponentType }): ReactNode {
  return (
    <Suspense fallback={<Skeleton shape="rect" />}>
      <Demo />
    </Suspense>
  );
}

export function RegistryShowcase(): ReactNode {
  return (
    <>
      <GreenSurfaces />
      <DisclosureSection />
      <AlertsSection />
      <NavigationParts />
      <ToggleSection />
      <FormSection />
      <OtpSection />
      <ScrollSection />
      <TableFooterSection />
      <SidebarSection />
      <Section name="Command">
        <Lazy Demo={CommandDemo} />
      </Section>
      <Section name="Carousel">
        <Lazy Demo={CarouselDemo} />
      </Section>
    </>
  );
}

/** `bg-primary` / `bg-sidebar` with their foregrounds: the header, hero and auth surfaces. */
function GreenSurfaces(): ReactNode {
  const { t } = useTranslation();
  return (
    <Section name="Green surfaces (primary / sidebar)">
      <div className="flex flex-col gap-4 rounded-2xl bg-primary p-6 text-primary-foreground">
        <p className="font-semibold text-title-2">
          {t("devTools.gallery.sampleTitle")}
        </p>
        <p className="text-body">{t("devTools.gallery.sampleText")}</p>
        <p className="text-body-sm text-primary-foreground-muted">
          {t("devTools.gallery.sampleText")}
        </p>
        <Row>
          <Button className="bg-primary-foreground text-primary hover:bg-primary-foreground/90">
            {t("common.continue")}
          </Button>
          <Button
            className="border-primary-foreground bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
            variant="secondary"
          >
            {t("common.learnMore")}
          </Button>
        </Row>
      </div>
      <div className="flex flex-col gap-2 rounded-2xl bg-sidebar p-6 text-sidebar-foreground">
        <p className="font-medium text-body">{t("nav.favorites")}</p>
        <p className="text-body-sm text-sidebar-foreground-muted">
          {t("devTools.gallery.sampleText")}
        </p>
      </div>
    </Section>
  );
}

function DisclosureSection(): ReactNode {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Section name="Accordion">
        <Accordion collapsible type="single">
          {["a", "b"].map((value) => (
            <AccordionItem key={value} value={value}>
              <AccordionTrigger>
                {t("devTools.gallery.sampleTitle")}
              </AccordionTrigger>
              <AccordionContent>
                {t("devTools.gallery.sampleText")}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Section>
      <Section name="Collapsible">
        <Collapsible onOpenChange={setOpen} open={open}>
          <CollapsibleTrigger asChild>
            <Button variant="secondary">{t("common.learnMore")}</Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 text-body-sm">
            {t("devTools.gallery.sampleText")}
          </CollapsibleContent>
        </Collapsible>
      </Section>
      <Section name="HoverCard / AspectRatio / Separator">
        <Row>
          <HoverCard>
            <HoverCardTrigger asChild>
              <a
                className="font-medium text-primary-strong underline underline-offset-4"
                href="#top"
              >
                {t("devTools.gallery.gestureHello")}
              </a>
            </HoverCardTrigger>
            <HoverCardContent>
              {t("devTools.gallery.sampleText")}
            </HoverCardContent>
          </HoverCard>
        </Row>
        <div className="w-40">
          <AspectRatio
            className="grid place-items-center rounded-2xl bg-muted"
            ratio={3 / 4}
          >
            <Heart aria-hidden="true" className="size-8 text-primary" />
          </AspectRatio>
        </div>
        <Separator />
      </Section>
    </>
  );
}

function AlertsSection(): ReactNode {
  const { t } = useTranslation();
  return (
    <Section name="Alert">
      {(["default", "success", "warning", "danger"] as const).map((variant) => (
        <Alert key={variant} variant={variant}>
          <Heart aria-hidden="true" />
          <AlertTitle>{t("devTools.gallery.sampleTitle")}</AlertTitle>
          <AlertDescription>
            {t("devTools.gallery.sampleText")}
          </AlertDescription>
          {variant === "default" ? (
            <AlertAction>
              <IconButton
                icon={<X />}
                label={t("a11y.dismiss")}
                size="sm"
                variant="ghost"
              />
            </AlertAction>
          ) : null}
        </Alert>
      ))}
    </Section>
  );
}

function NavigationParts(): ReactNode {
  const { t } = useTranslation();
  return (
    <Section name="Breadcrumb">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="#top">{t("nav.home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbEllipsis />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="#top">{t("nav.gestures")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              {t("devTools.gallery.gestureHello")}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </Section>
  );
}

function ToggleSection(): ReactNode {
  const { t } = useTranslation();
  return (
    <Section name="Toggle / ToggleGroup">
      <Row>
        <Toggle aria-label={t("nav.favorites")} defaultPressed>
          <Heart aria-hidden="true" />
        </Toggle>
        <Toggle aria-label={t("nav.lists")} variant="outline">
          <List aria-hidden="true" />
        </Toggle>
        <Toggle aria-label={t("nav.browse")} size="sm">
          <LayoutGrid aria-hidden="true" />
        </Toggle>
      </Row>
      <ToggleGroup
        aria-label={t("nav.browse")}
        defaultValue="grid"
        type="single"
        variant="outline"
      >
        <ToggleGroupItem aria-label={t("nav.gestures")} value="grid">
          <LayoutGrid aria-hidden="true" />
        </ToggleGroupItem>
        <ToggleGroupItem aria-label={t("nav.lists")} value="list">
          <List aria-hidden="true" />
        </ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup aria-label={t("nav.settings")} type="multiple">
        <ToggleGroupItem aria-label="Bold" value="bold">
          <Bold aria-hidden="true" />
        </ToggleGroupItem>
        <ToggleGroupItem aria-label="Italic" value="italic">
          <Italic aria-hidden="true" />
        </ToggleGroupItem>
        <ToggleGroupItem aria-label="Underline" value="underline">
          <Underline aria-hidden="true" />
        </ToggleGroupItem>
      </ToggleGroup>
    </Section>
  );
}

const demoSchema = z.object({
  name: z.string().min(2),
});

function NameField({
  field,
}: {
  field: ComponentProps<typeof Input>;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <FormItem>
      <FormLabel>{t("auth.name.label")}</FormLabel>
      <FormControl>
        <Input {...field} />
      </FormControl>
      <FormDescription>{t("auth.name.placeholder")}</FormDescription>
      <FormMessage />
    </FormItem>
  );
}

function renderNameField({
  field,
}: {
  field: ComponentProps<typeof Input>;
}): ReactElement {
  return <NameField field={field} />;
}

function FormSection(): ReactNode {
  const { t } = useTranslation();
  const form = useZodForm(demoSchema, { defaultValues: { name: "" } });
  const handleSubmit = form.handleSubmit(
    useCallback((): void => undefined, [])
  );
  return (
    <Section name="Form / Label">
      <Form {...form}>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FormField
            control={form.control}
            name="name"
            render={renderNameField}
          />
          <Row>
            <Button type="submit">{t("common.save")}</Button>
          </Row>
        </form>
      </Form>
      <div className="flex flex-col gap-2">
        <Label htmlFor="gallery-label">{t("auth.name.label")}</Label>
        <Input id="gallery-label" />
      </div>
    </Section>
  );
}

function OtpSection(): ReactNode {
  const { t } = useTranslation();
  return (
    <Section name="InputOTP">
      <InputOTP
        aria-label={t("auth.otp.label")}
        autoComplete="one-time-code"
        inputMode="numeric"
        maxLength={6}
      >
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
    </Section>
  );
}

function ScrollSection(): ReactNode {
  const { t } = useTranslation();
  return (
    <Section name="ScrollArea">
      <ScrollArea className="h-32 rounded-2xl border border-border">
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 12 }, (_, index) => (
            <p className="text-body-sm" key={index.toString()}>
              {t("devTools.gallery.sampleText")}
            </p>
          ))}
        </div>
      </ScrollArea>
      <Card className="max-w-reading">
        <CardHeader>
          <CardTitle level={4}>{t("devTools.gallery.sampleTitle")}</CardTitle>
          <CardDescription>{t("devTools.gallery.sampleText")}</CardDescription>
        </CardHeader>
        <CardAction>
          <Button size="sm" variant="ghost">
            {t("common.edit")}
          </Button>
        </CardAction>
      </Card>
    </Section>
  );
}

function TableFooterSection(): ReactNode {
  const { t } = useTranslation();
  return (
    <Section name="Table (TableFooter)">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("devTools.gallery.columnName")}</TableHead>
            <TableHead>{t("devTools.gallery.columnCount")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>{t("devTools.gallery.rowGreetings")}</TableCell>
            <TableCell>12</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>{t("devTools.gallery.columnCount")}</TableCell>
            <TableCell>12</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </Section>
  );
}

/** A static, non-collapsing sidebar on the green surface (the shell keeps its own). */
function SidebarSection(): ReactNode {
  const { t } = useTranslation();
  return (
    <Section name="Sidebar">
      <div className="h-64 overflow-hidden rounded-2xl border border-border">
        <SidebarProvider className="h-full min-h-0">
          <Sidebar collapsible="none">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>{t("nav.admin")}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive>
                        <a href="#top">
                          <Heart aria-hidden="true" />
                          <span>{t("nav.favorites")}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <a href="#top">
                          <Settings aria-hidden="true" />
                          <span>{t("nav.settings")}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
        </SidebarProvider>
      </div>
    </Section>
  );
}
