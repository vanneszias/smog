import { jest } from "@jest/globals";
import { vi } from "vitest";

vi.mock("@smog/auth", () => ({}));
jest.mock("@smog/styles");

export const MOCKED = true;
