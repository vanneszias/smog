import { jest } from "@jest/globals";
import { vi } from "vitest";

vi.mock("@smog/auth", () => ({}));
jest.mock("@smog/styles");
await vi.importMock("@smog/email");
jest.requireMock("@smog/jobs");
jest.setMock("@smog/payments", {});
jest.createMockFromModule("@smog/video");

export const MOCKED = true;
