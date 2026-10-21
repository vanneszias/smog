import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { classesOf, renderKit } from "../test/render";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "./input-otp";

describe("InputOTP", () => {
  test("one real input; typing fills the slots and completes", async () => {
    const onComplete = mock();
    renderKit(
      <InputOTP
        aria-label="Code"
        autoComplete="one-time-code"
        maxLength={4}
        onComplete={onComplete}
      >
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
        </InputOTPGroup>
      </InputOTP>
    );
    const input = screen.getByRole("textbox", { name: "Code" });
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    await userEvent.type(input, "1234");
    expect(onComplete).toHaveBeenCalledWith("1234");
    const slots = document.querySelectorAll('[data-slot="input-otp-slot"]');
    expect(slots).toHaveLength(4);
    expect(slots[0]?.textContent).toBe("1");
    expect(classesOf(slots[0] ?? null)).toContain("size-touch");
  });
});
