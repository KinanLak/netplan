import { ReactFlowProvider } from "@xyflow/react";
import FlowCanvas from "./canvas/FlowCanvas";
import Sidebar from "./panels/Sidebar";
import Toolbar from "./panels/Toolbar";
import DeviceDrawer from "./panels/DeviceDrawer";
import { useMapStore } from "./store/useMapStore";

export default function App() {
  const selectedDeviceId = useMapStore((state) => state.selectedDeviceId);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100">
      {/* Sidebar */}
      <Sidebar />

      {/* Main canvas area */}
      <main className="flex-1 relative">
        <ReactFlowProvider>
          <FlowCanvas />
          <Toolbar />
        </ReactFlowProvider>
      </main>

      {/* Device details drawer (conditional) */}
      {selectedDeviceId && <DeviceDrawer />}
    </div>
  );
}
