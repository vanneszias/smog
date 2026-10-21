import { useTranslation } from "@smog/i18n/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Heading,
  IconButton,
  Label,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Surface,
  Text,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
} from "@smog/ui-native";
import Bold from "lucide-react-native/icons/bold";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import Info from "lucide-react-native/icons/info";
import Italic from "lucide-react-native/icons/italic";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import { type ReactElement, type ReactNode, useState } from "react";
import { View } from "react-native";

/*
 * The phase 10a primitives in the component gallery: the green surfaces, the
 * Figtree weights and the Reusables set. Section titles are the components'
 * code names; every visible string comes from @smog/i18n.
 */

const noop = (): void => undefined;

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

function SurfaceSample({ tone }: { tone: "header" | "primary" }): ReactElement {
  const { t } = useTranslation();
  return (
    <Surface className="flex-col gap-3 rounded-lg p-4" tone={tone}>
      <Heading level={2}>{t("devTools.gallery.sampleTitle")}</Heading>
      <Text tone="muted">{t("devTools.gallery.sampleText")}</Text>
      <Row>
        <Button>{t("common.save")}</Button>
        <Button variant="secondary">{t("common.cancel")}</Button>
        <Button variant="ghost">{t("common.edit")}</Button>
        <IconButton icon={<Ellipsis />} label={t("a11y.moreActions")} />
      </Row>
    </Surface>
  );
}

function SurfacesAndFonts(): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <Section name="Surface">
        <SurfaceSample tone="primary" />
        <SurfaceSample tone="header" />
      </Section>
      <Section name="Figtree">
        <View className="flex-col gap-1">
          {(["regular", "medium", "semibold"] as const).map((weight) => (
            <Text className="text-title-3" key={weight} weight={weight}>
              {`${t("common.appName")} ${weight}`}
            </Text>
          ))}
          <Text className="font-bold text-title-3">
            {`${t("common.appName")} bold`}
          </Text>
        </View>
      </Section>
    </>
  );
}

function AccordionAndAlerts(): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <Section name="Accordion">
        <Accordion defaultValue="privacy">
          <AccordionItem value="privacy">
            <AccordionTrigger>{t("nav.privacy")}</AccordionTrigger>
            <AccordionContent>{t("auth.legal")}</AccordionContent>
          </AccordionItem>
          <AccordionItem value="account">
            <AccordionTrigger>{t("nav.account")}</AccordionTrigger>
            <AccordionContent>{t("auth.subtitle")}</AccordionContent>
          </AccordionItem>
          <AccordionItem value="settings">
            <AccordionTrigger disabled>{t("nav.settings")}</AccordionTrigger>
          </AccordionItem>
        </Accordion>
      </Section>
      <Section name="Alert">
        <Alert icon={<Info />}>
          <AlertTitle>{t("devTools.gallery.sampleTitle")}</AlertTitle>
          <AlertDescription>
            {t("devTools.gallery.sampleText")}
          </AlertDescription>
        </Alert>
        <Alert icon={<TriangleAlert />} variant="destructive">
          <AlertTitle>{t("states.actionFailed")}</AlertTitle>
          <AlertDescription>{t("auth.errors.generic")}</AlertDescription>
        </Alert>
      </Section>
    </>
  );
}

function TogglesAndPopover(): ReactElement {
  const { t } = useTranslation();
  const [view, setView] = useState("grid");
  return (
    <>
      <Section name="Label / Separator">
        <View className="flex-col gap-2">
          <Label>{t("auth.name.label")}</Label>
          <Separator />
          <Label disabled>{t("auth.email.label")}</Label>
        </View>
      </Section>
      <Section name="Toggle / ToggleGroup">
        <Row>
          <Toggle icon={<Bold />}>{t("theme.light")}</Toggle>
          <Toggle defaultPressed icon={<Italic />} variant="outline">
            {t("theme.dark")}
          </Toggle>
          <Toggle disabled>{t("theme.system")}</Toggle>
        </Row>
        <ToggleGroup onValueChange={setView} value={view} variant="outline">
          <ToggleGroupItem value="grid">{t("nav.browse")}</ToggleGroupItem>
          <ToggleGroupItem value="list">{t("nav.lists")}</ToggleGroupItem>
          <ToggleGroupItem value="favorites">
            {t("nav.favorites")}
          </ToggleGroupItem>
        </ToggleGroup>
      </Section>
      <Section name="Popover">
        <Row>
          <Popover>
            <PopoverTrigger>
              <Button variant="secondary">
                {t("devTools.gallery.openDialog")}
              </Button>
            </PopoverTrigger>
            <PopoverContent accessibilityLabel={t("a11y.moreActions")}>
              <Heading level={3}>{t("devTools.gallery.sampleTitle")}</Heading>
              <Text tone="muted">{t("devTools.gallery.sampleText")}</Text>
              <PopoverClose>
                <Button onPress={noop} size="sm">
                  {t("common.done")}
                </Button>
              </PopoverClose>
            </PopoverContent>
          </Popover>
        </Row>
      </Section>
    </>
  );
}

/** The phase 10a sections of the component gallery. */
export function PrimitivesGallery(): ReactElement {
  return (
    <>
      <SurfacesAndFonts />
      <AccordionAndAlerts />
      <TogglesAndPopover />
    </>
  );
}
