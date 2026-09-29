// biome-ignore-all lint/performance/noBarrelFile: the package entry point (`@smog/api`): the app contract and router (server).
export {
  type AppContract,
  appContract,
  systemContract,
  whoamiUserSchema,
} from "./contract";
export { type AppRouter, appRouter } from "./router";
