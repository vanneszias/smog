"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Pagination,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@smog/ui-web";
import { useState } from "react";
import { Note, Section, Specimen } from "./Section";

const ROWS = [
  { name: "Dag", category: "Begroetingen", uses: 128 },
  {
    name: "Aangenaam kennis met je te maken",
    category: "Begroetingen",
    uses: 4,
  },
  { name: "Mama", category: "Familie", uses: 96 },
  { name: "Appel", category: "Eten en drinken", uses: 51 },
];

export function LayoutSection() {
  const [page, setPage] = useState(1);

  return (
    <Section id="layout" title="Layout">
      <Note>
        <code>Card</code> has two edges and they mean different things: the
        default is decorative <code>border-subtle</code>, and the{" "}
        <code>interactive</code> variant takes the functional{" "}
        <code>border</code> plus a focus ring, because on that one the whole
        rectangle is the control.
      </Note>

      <Specimen
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
        label="Card — static and interactive"
      >
        <Card>
          <CardHeader>
            <CardTitle>Begroetingen</CardTitle>
            <CardDescription>
              Zeven gebaren, waarvan één nog in verwerking.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-foreground-muted text-sm">
              Een gewone kaart draagt geen betekenis in haar rand.
            </p>
          </CardContent>
          <CardFooter>
            <Button size="sm" variant="outline">
              Bekijken
            </Button>
          </CardFooter>
        </Card>

        <Card interactive>
          <CardHeader>
            <CardTitle asChild>
              <a href="#layout">Familie</a>
            </CardTitle>
            <CardDescription>
              De hele rechthoek is hier het doelwit.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-foreground-muted text-sm">
              Focus met de toetsenbord en de ring verschijnt op de kaart, niet
              alleen op de link.
            </p>
          </CardContent>
        </Card>
      </Specimen>

      <Specimen className="block w-full" label="Table">
        <Table>
          <TableCaption>Gebaren, gesorteerd op gebruik</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Naam</TableHead>
              <TableHead>Categorie</TableHead>
              <TableHead className="text-right">Gebruikt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROWS.map((row) => (
              <TableRow key={row.name}>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.category}</TableCell>
                <TableCell className="text-right">{row.uses}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>Totaal</TableCell>
              <TableCell className="text-right">
                {ROWS.reduce((total, row) => total + row.uses, 0)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Specimen>

      <Specimen className="block w-full" label="Tabs">
        <Tabs defaultValue="nl">
          <TabsList>
            <TabsTrigger value="nl">Nederlands</TabsTrigger>
            <TabsTrigger value="en">English</TabsTrigger>
            <TabsTrigger value="fr">Français</TabsTrigger>
            <TabsTrigger disabled value="de">
              Deutsch
            </TabsTrigger>
          </TabsList>
          <TabsContent value="nl">Aangenaam kennis met je te maken</TabsContent>
          <TabsContent value="en">Pleased to meet you</TabsContent>
          <TabsContent value="fr">
            Enchanté de faire ta connaissance
          </TabsContent>
          <TabsContent value="de">Niet vertaald</TabsContent>
        </Tabs>
      </Specimen>

      <Specimen
        className="block w-full"
        label="Pagination — first, middle, last"
      >
        <div className="flex flex-col gap-4">
          <Pagination onPageChange={setPage} page={page} pageCount={5} />
          <Pagination page={1} pageCount={5} />
          <Pagination page={3} pageCount={5} />
          <Pagination page={5} pageCount={5} />
          <Pagination page={1} pageCount={1} />
        </div>
      </Specimen>
    </Section>
  );
}
