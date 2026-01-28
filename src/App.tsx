import { ReactFlowProvider } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick01Icon, Edit01Icon } from "@hugeicons/core-free-icons";
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
                <HugeiconsIcon icon={Tick01Icon} size={20} color="currentColor" strokeWidth={1.5} />
                Terminer
              </>
            ) : (
              <>
                <HugeiconsIcon icon={Edit01Icon} size={20} color="currentColor" strokeWidth={1.5} />
                Modifier
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
