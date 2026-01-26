import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useMapStore } from "../store/useMapStore";
import type { DeviceStatus } from "../types/map";

const statusLabels: Record<DeviceStatus, string> = {
  up: "En ligne",
  down: "Hors ligne",
  unknown: "Inconnu",
};

const statusColors: Record<DeviceStatus, string> = {
  up: "bg-emerald-100 text-emerald-700",
  down: "bg-red-100 text-red-700",
  unknown: "bg-slate-100 text-slate-700",
};

const typeLabels: Record<string, string> = {
  rack: "Rack Serveur",
  switch: "Switch Réseau",
  pc: "Poste de travail",
  "wall-port": "Prise murale",
};

export default function DeviceDrawer() {
  const {
    devices,
    selectedDeviceId,
    selectDevice,
    deleteDevice,
    isEditMode,
    highlightedDeviceIds,
    setHighlightedDevices,
  } = useMapStore();

  const reactFlow = useReactFlow();

  const device = devices.find((d) => d.id === selectedDeviceId);

  // Get connected devices
  const connectedDevices =
    device?.metadata.connectedDeviceIds?.map((id) => devices.find((d) => d.id === id)).filter(Boolean) ?? [];

  const handleHighlightConnections = useCallback(() => {
    if (!device?.metadata.connectedDeviceIds) return;

    // Toggle highlight
    if (highlightedDeviceIds.length > 0) {
      setHighlightedDevices([]);
    } else {
      setHighlightedDevices(device.metadata.connectedDeviceIds);
    }
  }, [device, highlightedDeviceIds, setHighlightedDevices]);

  const handleSelectConnected = useCallback(
    (deviceId: string) => {
      const targetDevice = devices.find((d) => d.id === deviceId);
      if (targetDevice) {
        // Smooth camera movement to the target device
        const centerX = targetDevice.position.x + targetDevice.size.width / 2;
        const centerY = targetDevice.position.y + targetDevice.size.height / 2;

        reactFlow.setCenter(centerX, centerY, {
          duration: 500,
          zoom: 1,
        });
      }
      setHighlightedDevices([]);
      selectDevice(deviceId);
    },
    [devices, selectDevice, setHighlightedDevices, reactFlow],
  );

  if (!device) {
    return null;
  }

  const status = device.metadata.status ?? "unknown";

  return (
    <div className="absolute top-0 right-0 w-80 h-full bg-white border-l border-slate-200 flex flex-col shadow-xl z-20">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-slate-800 truncate">{device.name}</h2>
            <p className="text-sm text-slate-500">{typeLabels[device.type]}</p>
          </div>
          <button
            onClick={() => {
              setHighlightedDevices([]);
              selectDevice(null);
            }}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status badge */}
        <div className="mt-3">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[status]}`}
          >
            <span
              className={`w-2 h-2 rounded-full ${status === "up" ? "bg-emerald-500" : status === "down" ? "bg-red-500" : "bg-slate-400"}`}
            />
            {statusLabels[status]}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Hostname & IP */}
        {(device.hostname || device.metadata.ip) && (
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Réseau</h3>
            <div className="space-y-2">
              {device.hostname && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Hostname</span>
                  <span className="font-mono text-slate-800">{device.hostname}</span>
                </div>
              )}
              {device.metadata.ip && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">IP</span>
                  <span className="font-mono text-slate-800">{device.metadata.ip}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Last user (for PCs) */}
        {device.type === "pc" && device.metadata.lastUser && (
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Utilisateur</h3>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <div className="font-medium text-slate-800">{device.metadata.lastUser}</div>
                <div className="text-xs text-slate-500">Dernier connecté</div>
              </div>
            </div>
          </section>
        )}

        {/* Model */}
        {device.metadata.model && (
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Matériel</h3>
            <div className="text-sm">
              <span className="text-slate-800">{device.metadata.model}</span>
            </div>
          </section>
        )}

        {/* Connected devices */}
        {connectedDevices.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Connexions ({connectedDevices.length})
              </h3>
              <button
                onClick={handleHighlightConnections}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  highlightedDeviceIds.length > 0
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600"
                }`}
              >
                {highlightedDeviceIds.length > 0 ? "Masquer" : "Voir sur plan"}
              </button>
            </div>
            <div className="space-y-1">
              {connectedDevices.map(
                (connDevice) =>
                  connDevice && (
                    <button
                      key={connDevice.id}
                      onClick={() => handleSelectConnected(connDevice.id)}
                      className="w-full text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-blue-50 transition-colors group"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-slate-700 group-hover:text-blue-600">
                            {connDevice.name}
                          </div>
                          <div className="text-xs text-slate-500">{typeLabels[connDevice.type]}</div>
                        </div>
                        <div
                          className={`w-2 h-2 rounded-full ${
                            connDevice.metadata.status === "up"
                              ? "bg-emerald-400"
                              : connDevice.metadata.status === "down"
                                ? "bg-red-400"
                                : "bg-slate-400"
                          }`}
                        />
                      </div>
                    </button>
                  ),
              )}
            </div>
          </section>
        )}

        {/* Ports (for switches) */}
        {device.type === "switch" && device.metadata.ports && (
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Ports ({device.metadata.ports.length})
            </h3>
            <div className="grid grid-cols-12 gap-1">
              {device.metadata.ports.map((port) => (
                <div
                  key={port.id}
                  className={`
                    w-4 h-4 rounded-sm text-[8px] flex items-center justify-center
                    ${
                      port.status === "up"
                        ? "bg-emerald-500 text-white"
                        : port.status === "down"
                          ? "bg-red-500 text-white"
                          : "bg-slate-200 text-slate-600"
                    }
                  `}
                  title={`Port ${port.number}: ${port.status}`}
                >
                  {port.number}
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-emerald-500 rounded-sm" />
                {device.metadata.ports.filter((p) => p.status === "up").length} actifs
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-red-500 rounded-sm" />
                {device.metadata.ports.filter((p) => p.status === "down").length} down
              </span>
            </div>
          </section>
        )}

        {/* Position */}
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Position</h3>
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-slate-500">X:</span>{" "}
              <span className="font-mono text-slate-800">{device.position.x}</span>
            </div>
            <div>
              <span className="text-slate-500">Y:</span>{" "}
              <span className="font-mono text-slate-800">{device.position.y}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Footer actions */}
      {isEditMode && (
        <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-2">
          <button
            onClick={() => {
              deleteDevice(device.id);
              selectDevice(null);
            }}
            className="
              w-full px-4 py-2 rounded-lg text-sm font-medium
              bg-red-50 text-red-600 hover:bg-red-100
              transition-colors flex items-center justify-center gap-2
            "
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Supprimer
          </button>
        </div>
      )}
    </div>
  );
}
