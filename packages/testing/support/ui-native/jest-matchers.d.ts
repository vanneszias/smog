import type { JestNativeMatchers } from "@testing-library/react-native/dist/matchers/types";

// RNTL 14 augments @jest/expect; Jest 30 exposes these matchers from expect.
declare module "expect" {
  interface Matchers<R extends void | Promise<void>>
    extends JestNativeMatchers<R> {}
}
