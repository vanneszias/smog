import { tokens } from "@smog/styles";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { resolvedColor } from "../test/resolvedColor";
import { CategoryFilter } from "./CategoryFilter";

const CATEGORIES = [
  { id: "c1", name: "Begroetingen" },
  { id: "c2", name: "Familie" },
];

describe("CategoryFilter", () => {
  it("renders a chip per category, plus 'all'", () => {
    render(
      <CategoryFilter
        categories={CATEGORIES}
        onChange={jest.fn()}
        selected={null}
      />
    );

    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("selects the 'all' chip when selected is null", () => {
    render(
      <CategoryFilter
        categories={CATEGORIES}
        onChange={jest.fn()}
        selected={null}
      />
    );

    expect(screen.getByRole("button", { name: "Alles" })).toBeSelected();
  });

  it("does not select 'all' once a category is selected", () => {
    render(
      <CategoryFilter
        categories={CATEGORIES}
        onChange={jest.fn()}
        selected="c1"
      />
    );

    expect(screen.getByRole("button", { name: "Alles" })).not.toBeSelected();
  });

  it("selects the chip named by selected", () => {
    render(
      <CategoryFilter
        categories={CATEGORIES}
        onChange={jest.fn()}
        selected="c2"
      />
    );

    expect(screen.getByRole("button", { name: "Familie" })).toBeSelected();
    expect(
      screen.getByRole("button", { name: "Begroetingen" })
    ).not.toBeSelected();
  });

  it("calls onChange with the pressed category's id", () => {
    const onChange = jest.fn();
    render(
      <CategoryFilter
        categories={CATEGORIES}
        onChange={onChange}
        selected={null}
      />
    );

    fireEvent.press(screen.getByText("Familie"));

    expect(onChange).toHaveBeenCalledWith("c2");
  });

  /*
   * The whole point: a filter with no way back to "all" is a bug. Pressing
   * the already-selected chip has to turn it off, not re-select itself.
   */
  it("calls onChange with null when the selected chip is pressed again", () => {
    const onChange = jest.fn();
    render(
      <CategoryFilter
        categories={CATEGORIES}
        onChange={onChange}
        selected="c2"
      />
    );

    fireEvent.press(screen.getByText("Familie"));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("calls onChange with null when 'all' is pressed", () => {
    const onChange = jest.fn();
    render(
      <CategoryFilter
        categories={CATEGORIES}
        onChange={onChange}
        selected="c1"
      />
    );

    fireEvent.press(screen.getByText("Alles"));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("lets a caller word the 'all' chip", () => {
    render(
      <CategoryFilter
        allLabel="Alle gebaren"
        categories={CATEGORIES}
        onChange={jest.fn()}
        selected={null}
      />
    );

    expect(screen.getByText("Alle gebaren")).toBeOnTheScreen();
  });

  it("renders only the 'all' chip for an empty category list", () => {
    render(
      <CategoryFilter categories={[]} onChange={jest.fn()} selected={null} />
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("lets a caller's className reach the root and win", () => {
    render(
      <CategoryFilter
        categories={CATEGORIES}
        className="bg-danger"
        onChange={jest.fn()}
        selected={null}
        testID="subject"
      />
    );

    expect(screen.getByTestId("subject")).toHaveStyle({
      backgroundColor: resolvedColor(tokens.semantic.light.danger),
    });
  });
});
