"use client";

import {
  Button,
  Checkbox,
  Field,
  Input,
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@smog/ui-web";
import { Heart } from "lucide-react";
import { useState } from "react";
import { Note, Section, Specimen } from "./Section";

const BUTTON_VARIANTS = [
  "primary",
  "secondary",
  "outline",
  "ghost",
  "danger",
] as const;

const CONTROL_SIZES = ["sm", "md", "lg"] as const;

export function FormsSection() {
  const [checked, setChecked] = useState(true);
  const [switched, setSwitched] = useState(true);
  const [category, setCategory] = useState("begroetingen");

  return (
    <Section id="forms" title="Form primitives">
      <Note>
        Every control is uncontrolled unless a state hook below says otherwise,
        so the disabled and invalid rows are real states rather than screenshots
        of them.
      </Note>

      <Specimen label="Button — variant">
        {BUTTON_VARIANTS.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
      </Specimen>

      <Specimen label="Button — size">
        {CONTROL_SIZES.map((size) => (
          <Button key={size} size={size}>
            {size}
          </Button>
        ))}
        <Button aria-label="Favoriet" size="icon" variant="ghost">
          <Heart aria-hidden="true" className="size-5" />
        </Button>
      </Specimen>

      <Specimen label="Button — disabled, loading, and rendered as a link">
        {BUTTON_VARIANTS.map((variant) => (
          <Button disabled key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
        <Button loading>Opslaan</Button>
        <Button loading variant="danger">
          Verwijderen
        </Button>
        <Button asChild variant="outline">
          <a href="#forms">Een anker als knop</a>
        </Button>
      </Specimen>

      <Specimen className="grid grid-cols-1 gap-4 md:grid-cols-3" label="Input">
        {CONTROL_SIZES.map((size) => (
          <Input key={size} placeholder={`size=${size}`} size={size} />
        ))}
        <Input defaultValue="Met waarde" />
        <Input disabled placeholder="disabled" />
        <Input invalid placeholder="invalid" />
      </Specimen>

      <Specimen
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
        label="Textarea"
      >
        {CONTROL_SIZES.map((size) => (
          <Textarea key={size} placeholder={`size=${size}`} size={size} />
        ))}
        <Textarea defaultValue="Aangenaam kennis met je te maken" />
        <Textarea disabled placeholder="disabled" />
        <Textarea invalid placeholder="invalid" />
      </Specimen>

      <Specimen label="Checkbox">
        {CONTROL_SIZES.map((size) => (
          <span className="flex items-center gap-2" key={size}>
            <Checkbox defaultChecked id={`checkbox-${size}`} size={size} />
            <Label htmlFor={`checkbox-${size}`}>{size}</Label>
          </span>
        ))}
        <span className="flex items-center gap-2">
          <Checkbox
            checked={checked}
            id="checkbox-controlled"
            onCheckedChange={(next) => setChecked(next === true)}
          />
          <Label htmlFor="checkbox-controlled">
            gestuurd ({checked ? "aan" : "uit"})
          </Label>
        </span>
        <span className="flex items-center gap-2">
          <Checkbox checked="indeterminate" id="checkbox-mixed" />
          <Label htmlFor="checkbox-mixed">indeterminate</Label>
        </span>
        <span className="flex items-center gap-2">
          <Checkbox disabled id="checkbox-disabled" />
          <Label htmlFor="checkbox-disabled">disabled</Label>
        </span>
      </Specimen>

      <Specimen label="Switch">
        {CONTROL_SIZES.map((size) => (
          <span className="flex items-center gap-2" key={size}>
            <Switch defaultChecked id={`switch-${size}`} size={size} />
            <Label htmlFor={`switch-${size}`}>{size}</Label>
          </span>
        ))}
        <span className="flex items-center gap-2">
          <Switch
            checked={switched}
            id="switch-controlled"
            onCheckedChange={setSwitched}
          />
          <Label htmlFor="switch-controlled">
            gestuurd ({switched ? "aan" : "uit"})
          </Label>
        </span>
        <span className="flex items-center gap-2">
          <Switch disabled id="switch-disabled" />
          <Label htmlFor="switch-disabled">disabled</Label>
        </span>
      </Specimen>

      <Specimen label="Select">
        {CONTROL_SIZES.map((size) => (
          <Select key={size} onValueChange={setCategory} value={category}>
            <SelectTrigger className="w-[200px]" size={size}>
              <SelectValue placeholder="Kies een categorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Categorieën</SelectLabel>
                <SelectItem value="begroetingen">Begroetingen</SelectItem>
                <SelectItem value="familie">Familie</SelectItem>
                <SelectSeparator />
                <SelectItem value="eten">Eten en drinken</SelectItem>
                <SelectItem disabled value="getallen">
                  Getallen (uitgeschakeld)
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        ))}
        <Select disabled>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="disabled" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Niets</SelectItem>
          </SelectContent>
        </Select>
      </Specimen>

      <Specimen
        className="grid grid-cols-1 gap-6 md:grid-cols-3"
        label="Field — label, help text and error"
      >
        <Field htmlFor="field-plain" label="Naam">
          <Input id="field-plain" placeholder="Dag" />
        </Field>
        <Field
          help="De Nederlandse naam is de bron; en en fr zijn optioneel."
          htmlFor="field-help"
          label="Naam (nl)"
        >
          <Input id="field-help" placeholder="Dag" />
        </Field>
        <Field
          error="Dit veld is verplicht."
          help="De Nederlandse naam is de bron."
          htmlFor="field-error"
          label="Naam (nl)"
        >
          <Input id="field-error" />
        </Field>
        <Field
          error="Kies ten minste één categorie."
          htmlFor="field-error-select"
          label="Categorie"
        >
          <Textarea id="field-error-select" />
        </Field>
      </Specimen>
    </Section>
  );
}
