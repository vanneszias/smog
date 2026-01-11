import { useConvex } from "convex/react";
import { useEffect, useRef } from "react";
import { convexService } from "@/services/convexService";
import { convexSyncService } from "@/services/convexSyncService";
import logger from "@/utils/logger";

export const useConvexInit = () => {
  const convex = useConvex();
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Prevent re-initialization
    if (hasInitialized.current) {
      return;
    }

    const initializeServices = async () => {
      try {
        // Initialize convex service with the client
        await convexService.initialize(convex);

        // Initialize sync service with the client
        await convexSyncService.initialize(convex);

        hasInitialized.current = true;

        logger.log("[useConvexInit] Services initialized successfully");
      } catch (error) {
        logger.error("[useConvexInit] Failed to initialize services:", error);
      }
    };

    if (convex) {
      initializeServices();
    }
  }, [convex]);
};
