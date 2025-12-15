/**
 * Event Emitter for composition events
 * Single responsibility: Manage event listeners and emit events
 */

import type { CompositionEvent, CompositionEventListener } from "./events";

export class CompositionEventEmitter {
  private readonly listeners: Set<CompositionEventListener> = new Set();

  subscribe(listener: CompositionEventListener): () => void {
    this.listeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: CompositionEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
