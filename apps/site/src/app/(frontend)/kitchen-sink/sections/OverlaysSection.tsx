"use client";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@smog/ui-web";
import { Note, Section, Specimen } from "./Section";

const SHEET_SIDES = ["top", "right", "bottom", "left"] as const;

export function OverlaysSection() {
  return (
    <Section id="overlays" title="Overlays">
      <Note>
        Escape closes each of these and focus returns to the trigger that opened
        it — the half people forget, and the half that is only visible with a
        keyboard. Try it here with Tab and Escape rather than with the mouse.
      </Note>

      <Specimen label="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button>Gebaar bewerken</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gebaar bewerken</DialogTitle>
              <DialogDescription>
                Wijzig de Nederlandse naam. De vertalingen blijven ongemoeid.
              </DialogDescription>
            </DialogHeader>
            <Input defaultValue="Aangenaam kennis met je te maken" />
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Annuleren</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button>Opslaan</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="danger">Verwijderen</Button>
          </DialogTrigger>
          <DialogContent showClose={false}>
            <DialogHeader>
              <DialogTitle>Dit gebaar verwijderen?</DialogTitle>
              <DialogDescription>
                Zonder sluitknop: deze moet via een van de eigen knoppen worden
                afgehandeld.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Annuleren</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="danger">Verwijderen</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Specimen>

      <Specimen label="Sheet — every side">
        {SHEET_SIDES.map((side) => (
          <Sheet key={side}>
            <SheetTrigger asChild>
              <Button variant="outline">{side}</Button>
            </SheetTrigger>
            <SheetContent side={side}>
              <SheetHeader>
                <SheetTitle>Filters ({side})</SheetTitle>
                <SheetDescription>
                  Dezelfde inhoud, vier randen van het scherm.
                </SheetDescription>
              </SheetHeader>
              <Input placeholder="Zoeken" />
              <SheetFooter>
                <SheetClose asChild>
                  <Button>Toepassen</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        ))}
      </Specimen>

      <Specimen label="DropdownMenu">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">Acties</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Gebaar</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem>Bewerken</DropdownMenuItem>
              <DropdownMenuItem>Dupliceren</DropdownMenuItem>
              <DropdownMenuItem disabled>
                Publiceren (uitgeschakeld)
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Verwijderen</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Specimen>

      {/*
       * Both tooltips open on hover and focus; neither is pinned open.
       *
       * A pinned `<Tooltip open>` specimen stood here first, and it broke
       * Escape for every overlay on the page. `@radix-ui/react-tooltip@1.2.8`
       * pins `@radix-ui/react-dismissable-layer@1.1.11` while
       * `@radix-ui/react-dialog@1.1.23` pins `1.1.19`, so two copies of that
       * package are installed, each with its own module-level layer stack.
       * The open tooltip believes it is the top layer in its stack, calls
       * `event.preventDefault()` on Escape, and the dialog's copy — which
       * does `if (!event.defaultPrevented && onDismiss)` — then declines to
       * close. Measured, not inferred; see the Task 8 report.
       *
       * Hover-driven tooltips close before a dialog opens, so the pairing is
       * not reachable here any more. Deduping the two copies is the real fix
       * and is not Task 8's to make.
       */}
      <Specimen label="Tooltip — hover or focus either trigger">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">Wijs me aan</Button>
            </TooltipTrigger>
            <TooltipContent>Verschijnt na een korte pauze</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">En hieronder</Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Dezelfde tooltip, onder de knop
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </Specimen>

      {/*
       * The layer probe: a tooltip and a dialog next to each other, with
       * stable test ids, so `overlay-layers.spec.ts` can hold one open while
       * opening the other. Two installed copies of
       * `@radix-ui/react-dismissable-layer` keep independent layer stacks, and
       * the only observable symptom is Escape reaching the wrong one. This
       * pair exists to keep that observable rather than to demonstrate a
       * component.
       */}
      <Specimen label="Layer probe — a tooltip and a dialog in contact">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button data-testid="layer-probe-tooltip-trigger" variant="ghost">
                Laag-probe tooltip
              </Button>
            </TooltipTrigger>
            <TooltipContent>Laag-probe</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Dialog>
          <DialogTrigger asChild>
            <Button data-testid="layer-probe-dialog-trigger" variant="outline">
              Laag-probe dialoog
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Laag-probe</DialogTitle>
              <DialogDescription>
                Escape moet deze sluiten, ook terwijl de tooltip ernaast open
                staat.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Sluiten</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Specimen>
    </Section>
  );
}
