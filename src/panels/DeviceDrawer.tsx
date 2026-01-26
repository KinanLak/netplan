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
  const { devices, selectedDeviceId, selectDevice, deleteDevice } = useMapStore();

  const device = devices.find((d) => d.id === selectedDeviceId);

  if (!device) {
    return null;
  }

  const status = device.metadata.status ?? "unknown";

  return (
    <div className="w-80 h-full bg-white border-l border-slate-200 flex flex-col shadow-xl">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-slate-800 truncate">{device.name}</h2>
            <p className="text-sm text-slate-500">{typeLabels[device.type]}</p>
          </div>
          <button
            onClick={() => selectDevice(null)}
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

        {/* Model */}
        {device.metadata.model && (
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Matériel</h3>
            <div className="text-sm">
              <span className="text-slate-800">{device.metadata.model}</span>
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
      <div className="p-4 border-t border-slate-200 bg-slate-50">
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
    </div>
  );
}
