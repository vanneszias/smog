import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import stylesUrl from "../styles.css?url";

export const Route = createRootRoute({
  component: RootComponent,
  head: () => ({
    links: [{ href: stylesUrl, rel: "stylesheet" }],
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      { title: "SMOG & Co" },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
});

function RootComponent(): ReactNode {
  return <Outlet />;
}

function NotFound(): ReactNode {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p>404</p>
    </main>
  );
}

function RootDocument({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="nl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
