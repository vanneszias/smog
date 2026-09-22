import { tokens } from "@smog/styles";
import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { resolvedColor } from "../test/resolvedColor";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { Input } from "./Input";
import { Skeleton } from "./Skeleton";
import { Switch } from "./Switch";
import { Text } from "./Text";

const CASES: [string, (props: { className?: string }) => ReactElement][] = [
  ["Text", (p) => <Text {...p}>text</Text>],
  ["Input", (p) => <Input label="Email" {...p} />],
  ["Card", (p) => <Card {...p}>card</Card>],
  ["Badge", (p) => <Badge {...p}>badge</Badge>],
  [
    "Switch",
    (p) => (
      <Switch label="On" onValueChange={() => undefined} value={false} {...p} />
    ),
  ],
  ["Skeleton", (p) => <Skeleton {...p} />],
  ["EmptyState", (p) => <EmptyState title="Nothing here" {...p} />],
  ["Avatar", (p) => <Avatar name="Ada Lovelace" {...p} />],
];

describe.each(CASES)("%s", (_name, Component) => {
  it("renders", () => {
    expect(render(<Component />).toJSON()).not.toBeNull();
  });

  it("lets a caller's className reach the root and win", () => {
    render(<Component className="bg-danger" />);

    // Every component roots at `testID="root"`; see the package convention.
    expect(screen.getByTestId("root")).toHaveStyle({
      backgroundColor: resolvedColor(tokens.semantic.light.danger),
    });
  });
});
