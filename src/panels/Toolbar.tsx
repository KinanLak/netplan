import { useCallback, useState, useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import { useMapStore } from "../store/useMapStore";
import type { DeviceType, Device } from "../types/map";
import { availableDevicesCatalog, type AvailableDevice } from "../mock/availableDevices";

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

export default function Toolbar() {
  const { currentFloorId, addDevice, isEditMode, checkCollision } = useMapStore();
  const reactFlow = useReactFlow();
  const [selectedType, setSelectedType] = useState<DeviceType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleTypeClick = useCallback((type: DeviceType) => {
    setSelectedType((prev) => (prev === type ? null : type));
    setSearchQuery("");
  }, []);

  const handleAddDevice = useCallback(
    (catalogDevice: AvailableDevice) => {
      if (!currentFloorId) return;

      // Get center of viewport
      const { x, y, zoom } = reactFlow.getViewport();
      const centerX = (-x + window.innerWidth / 2) / zoom;
      const centerY = (-y + window.innerHeight / 2) / zoom;

      // Snap to grid (20px)
      const snappedX = Math.round(centerX / 20) * 20;
      const snappedY = Math.round(centerY / 20) * 20;

      const position = { x: snappedX, y: snappedY };

      // Check collision at this position
      const hasCollision = checkCollision("", position, catalogDevice.size);

      // If collision, try to find a free spot nearby
      let finalPosition = position;
      if (hasCollision) {
        // Try positions in a spiral pattern
        const offsets = [
          { x: 100, y: 0 },
          { x: 0, y: 100 },
          { x: -100, y: 0 },
          { x: 0, y: -100 },
          { x: 100, y: 100 },
          { x: -100, y: 100 },
          { x: -100, y: -100 },
          { x: 100, y: -100 },
          { x: 200, y: 0 },
          { x: 0, y: 200 },
        ];

        for (const offset of offsets) {
          const newPos = {
            x: Math.round((snappedX + offset.x) / 20) * 20,
            y: Math.round((snappedY + offset.y) / 20) * 20,
          };
          if (!checkCollision("", newPos, catalogDevice.size)) {
            finalPosition = newPos;
            break;
          }
        }
      }

      const newDevice: Omit<Device, "id"> = {
        type: catalogDevice.type,
        name: catalogDevice.name,
        hostname: catalogDevice.hostname,
        floorId: currentFloorId,
        position: finalPosition,
        size: catalogDevice.size,
        metadata: {
          ...catalogDevice.metadata,
          ip: catalogDevice.ip,
        },
      };

      addDevice(newDevice);
      setSelectedType(null);
      setSearchQuery("");
    },
    [currentFloorId, addDevice, reactFlow, checkCollision],
  );

  const availableDevices = selectedType ? availableDevicesCatalog[selectedType] : [];

  // Filter devices based on search query
  const filteredDevices = useMemo(() => {
    if (!searchQuery.trim()) return availableDevices;
    const query = searchQuery.toLowerCase();
    return availableDevices.filter(
      (device) =>
        device.name.toLowerCase().includes(query) ||
        device.model?.toLowerCase().includes(query) ||
        device.hostname?.toLowerCase().includes(query),
    );
  }, [availableDevices, searchQuery]);

  if (!isEditMode) {
    return null;
  }

  return (
    <div className="absolute top-4 right-4 z-10 flex gap-2">
      {/* Device selection dropdown - appears left of toolbar when active */}
      {selectedType && (
        <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-slate-200 p-2 w-56 max-h-64 flex flex-col">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Choisir un équipement
          </div>

          {/* Search input */}
          <div className="relative mb-1.5">
            <svg
              className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher..."
              className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Device list */}
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {filteredDevices.length > 0 ? (
              filteredDevices.map((device) => (
                <button
                  key={device.id}
                  onClick={() => handleAddDevice(device)}
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-blue-50 transition-colors group"
                >
                  <div className="font-medium text-slate-800 text-xs group-hover:text-blue-600">{device.name}</div>
                  {device.model && <div className="text-[10px] text-slate-500">{device.model}</div>}
                  {device.hostname && <div className="text-[10px] text-slate-400 font-mono">{device.hostname}</div>}
                </button>
              ))
            ) : (
              <div className="text-center py-2 text-xs text-slate-400">Aucun résultat</div>
            )}
          </div>
        </div>
      )}

      {/* Main toolbar - vertical compact */}
      <div className="flex flex-col gap-1 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg border border-slate-200 p-1.5">
        {toolbarButtons.map((btn) => (
          <button
            key={btn.type}
            onClick={() => handleTypeClick(btn.type)}
            disabled={!currentFloorId}
            className={`
              flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md
              transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              ${
                selectedType === btn.type
                  ? "bg-blue-100 text-blue-600 ring-2 ring-blue-400"
                  : "text-slate-600 hover:text-blue-600 hover:bg-blue-50"
              }
            `}
            title={`Ajouter ${btn.label}`}
          >
            <span className="[&>svg]:w-4 [&>svg]:h-4">{btn.icon}</span>
            <span className="text-[10px] font-medium">{btn.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
