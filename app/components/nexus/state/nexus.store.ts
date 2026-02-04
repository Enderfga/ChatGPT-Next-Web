import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// Define the types for our state
interface NexusState {
  // UI State - Panel Visibility
  isTerminalOpen: boolean;
  isCouncilOpen: boolean;
  isIntelOpen: boolean;

  // UI State - Active Tabs
  activeMainTab: "chat" | "terminal" | "visualizer";
  activeRightPanel: "terminal" | "council" | "intel";

  // Session / System State
  currentSessionId: string | null;
  agentStatus: "idle" | "working" | "error" | "thinking";

  // Actions
  toggleTerminal: () => void;
  toggleCouncil: () => void;
  toggleIntel: () => void;
  setActiveRightPanel: (panel: "terminal" | "council" | "intel") => void;
  setAgentStatus: (status: "idle" | "working" | "error" | "thinking") => void;
}

// Create the store
export const useNexusStore = create<NexusState>()(
  persist(
    (set) => ({
      // Initial State
      isTerminalOpen: true,
      isCouncilOpen: false, // Default closed
      isIntelOpen: true, // Default open (bottom right)

      activeMainTab: "chat",
      activeRightPanel: "terminal",

      currentSessionId: null,
      agentStatus: "idle",

      // Actions
      toggleTerminal: () =>
        set((state) => ({ isTerminalOpen: !state.isTerminalOpen })),
      toggleCouncil: () =>
        set((state) => ({
          isCouncilOpen: !state.isCouncilOpen,
          // If opening council, ensure terminal might be closed or handled by layout
          activeRightPanel: !state.isCouncilOpen
            ? "council"
            : state.activeRightPanel,
        })),
      toggleIntel: () => set((state) => ({ isIntelOpen: !state.isIntelOpen })),

      setActiveRightPanel: (panel) => set({ activeRightPanel: panel }),

      setAgentStatus: (status) => set({ agentStatus: status }),
    }),
    {
      name: "nexus-storage", // name of the item in the storage (must be unique)
      storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
      // We can choose to persist only specific fields if needed
      // partialize: (state) => ({ isTerminalOpen: state.isTerminalOpen }),
    },
  ),
);
