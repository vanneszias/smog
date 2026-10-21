import { describe, expect, mock, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import type { ControllerRenderProps } from "react-hook-form";
import { z } from "zod";
import { renderKit } from "../test/render";
import { Button } from "./button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
  useZodForm,
} from "./form";
import { Input } from "./input";

const schema = z.object({
  name: z.string().min(2, "Enter at least 2 characters"),
});

function renderName({
  field,
}: {
  field: ControllerRenderProps<{ name: string }, "name">;
}): ReactElement {
  return (
    <FormItem>
      <FormLabel>Name</FormLabel>
      <FormControl>
        <Input {...field} />
      </FormControl>
      <FormDescription>Your display name.</FormDescription>
      <FormMessage />
    </FormItem>
  );
}

function NameForm({
  onSubmit,
}: {
  onSubmit: (values: z.output<typeof schema>) => void;
}): ReactNode {
  const form = useZodForm(schema, { defaultValues: { name: "" } });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField control={form.control} name="name" render={renderName} />
        <Button type="submit">Save</Button>
      </form>
    </Form>
  );
}

describe("Form", () => {
  test("the label, description and control are wired; a resolver error is an alert", async () => {
    const onSubmit = mock();
    renderKit(<NameForm onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toContain("description");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Enter at least 2 characters");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("a valid value reaches onSubmit parsed by the schema", async () => {
    const onSubmit = mock();
    renderKit(<NameForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Ann");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ name: "Ann" });
  });

  test("useFormField outside a FormField throws", () => {
    function Bare(): ReactNode {
      useFormField();
      return null;
    }
    function Wrapper(): ReactNode {
      const form = useZodForm(schema);
      return (
        <Form {...form}>
          <Bare />
        </Form>
      );
    }
    expect(() => renderKit(<Wrapper />)).toThrow();
  });
});
