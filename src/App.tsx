import { ReactFlowProvider } from "@xyflow/react";
import FlowCanvas from "./canvas/FlowCanvas";
import Sidebar from "./panels/Sidebar";
import Toolbar from "./panels/Toolbar";
import DeviceDrawer from "./panels/DeviceDrawer";
import { useMapStore } from "./store/useMapStore";

export default function App() {
  const selectedDeviceId = useMapStore((state) => state.selectedDeviceId);
  const isEditMode = useMapStore((state) => state.isEditMode);
  const toggleEditMode = useMapStore((state) => state.toggleEditMode);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100">
      {/* Sidebar */}
      <Sidebar />

      {/* Main canvas area */}
      <main className="flex-1 relative">
        <ReactFlowProvider>
          <FlowCanvas />
          <Toolbar />
          {/* Device details drawer (conditional) - inside ReactFlowProvider for camera control */}
          {selectedDeviceId && <DeviceDrawer />}
        </ReactFlowProvider>

        {/* Mode toggle button - top left */}
        <div className="absolute top-4 left-4 z-10">
          <button
            onClick={toggleEditMode}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg border
              font-medium text-sm transition-all
              ${
                isEditMode
                  ? "bg-emerald-50 border-emerald-400 text-emerald-700 hover:bg-emerald-100"
                  : "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
              }
            `}
            title={isEditMode ? "Terminer les modifications" : "Modifier le plan"}
          >
            {isEditMode ? (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Terminer
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                Modifier
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
