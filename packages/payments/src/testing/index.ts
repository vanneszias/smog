// biome-ignore-all lint/performance/noBarrelFile: the `@smog/payments/testing` entry point (tests only).
export {
  createFakeMollie,
  FAKE_MOLLIE_API_KEY,
  type FakeMollie,
  type FakeMollieOptions,
  type FakeMollieRequest,
  type FakePayment,
} from "./fake-mollie";
