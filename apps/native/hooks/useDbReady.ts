import { useCallback, useEffect, useState } from "react";
import { convexSyncService } from "@/services/convexSyncService";

export const useDbReady = () => {
  const [isReady, setIsReady] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const checkReady = useCallback(async () => {
    const ready = await convexSyncService.isReadyForNavigation();
    setIsReady(ready);
    setIsChecking(false);
  }, []);

  useEffect(() => {
    checkReady();

    const interval = setInterval(() => {
      checkReady();
    }, 500);

    return () => clearInterval(interval);
  }, [checkReady]);

  return { isReady, isChecking };
};
