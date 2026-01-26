import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useMapStore } from "../store/useMapStore";
import type { DeviceType, Device } from "../types/map";

interface ToolbarButton {
  type: DeviceType;
  label: string;
  icon: React.ReactNode;
}

const toolbarButtons: ToolbarButton[] = [
  {
    type: "rack",
    label: "Rack",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
        />
      </svg>
    ),
  },
  {
    type: "switch",
    label: "Switch",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    type: "pc",
    label: "PC",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    type: "wall-port",
    label: "Prise",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
];

const defaultSizes: Record<DeviceType, { width: number; height: number }> = {
  rack: { width: 80, height: 160 },
  switch: { width: 200, height: 60 },
  pc: { width: 60, height: 60 },
  "wall-port": { width: 40, height: 40 },
};

export default function Toolbar() {
  const { currentFloorId, addDevice } = useMapStore();
  const reactFlow = useReactFlow();

  const handleAddDevice = useCallback(
    (type: DeviceType) => {
      if (!currentFloorId) return;

      // Get center of viewport
      const { x, y, zoom } = reactFlow.getViewport();
      const centerX = (-x + window.innerWidth / 2) / zoom;
      const centerY = (-y + window.innerHeight / 2) / zoom;

      // Snap to grid (20px)
      const snappedX = Math.round(centerX / 20) * 20;
      const snappedY = Math.round(centerY / 20) * 20;

      const newDevice: Omit<Device, "id"> = {
        type,
        name: `Nouveau ${type}`,
        floorId: currentFloorId,
        position: { x: snappedX, y: snappedY },
        size: defaultSizes[type],
        metadata: {
          status: "unknown",
        },
      };

      if (type === "switch") {
        newDevice.metadata.ports = Array.from({ length: 24 }, (_, i) => ({
          id: `port-${i + 1}`,
          number: i + 1,
          status: "unknown",
        }));
      }

      addDevice(newDevice);
    },
    [currentFloorId, addDevice, reactFlow],
  );

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
      <div className="flex gap-2 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 p-2">
        {toolbarButtons.map((btn) => (
          <button
            key={btn.type}
            onClick={() => handleAddDevice(btn.type)}
            disabled={!currentFloorId}
            className="
              flex flex-col items-center gap-1 px-3 py-2 rounded-lg
              text-slate-600 hover:text-blue-600 hover:bg-blue-50
              transition-colors disabled:opacity-50 disabled:cursor-not-allowed
            "
            title={`Ajouter ${btn.label}`}
          >
            {btn.icon}
            <span className="text-xs font-medium">{btn.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
