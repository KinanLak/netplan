import { HugeiconsIcon } from "@hugeicons/react";
import { Building05Icon, DashedLine01Icon, SolidLine01Icon } from "@hugeicons/core-free-icons";
import { useMapStore } from "../store/useMapStore";

export default function Sidebar() {
  const { buildings, currentBuildingId, currentFloorId, setCurrentBuilding, setCurrentFloor } = useMapStore();

  const currentBuilding = buildings.find((b) => b.id === currentBuildingId);

  return (
    <aside className="w-64 h-full bg-linear-to-b from-slate-900 to-slate-800 text-white flex flex-col border-r border-slate-700">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <h1 className="text-lg font-bold tracking-tight">
          <span className="text-blue-400">Net</span>Plan
        </h1>
        <p className="text-xs text-slate-400 mt-1">Cartographie Réseau</p>
      </div>

      {/* Buildings & Floors */}
      <nav className="flex-1 overflow-y-auto p-3">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Bâtiments</div>

        {buildings.map((building) => (
          <div key={building.id} className="mb-3">
            {/* Building */}
            <button
              onClick={() => setCurrentBuilding(building.id)}
              className={`
                w-full text-left px-3 py-2 rounded-lg text-sm font-medium
                transition-colors flex items-center gap-2
                ${building.id === currentBuildingId ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-700"}
              `}
            >
              <HugeiconsIcon icon={Building05Icon} size={16} color="currentColor" strokeWidth={1.5} />
              {building.name}
            </button>

            {/* Floors (only show if building is selected) */}
            {building.id === currentBuildingId && (
              <div className="mt-1 ml-4 space-y-1">
                {building.floors.map((floor) => (
                  <button
                    key={floor.id}
                    onClick={() => setCurrentFloor(floor.id)}
                    className={`
                      w-full text-left px-3 py-1.5 rounded text-sm
                      transition-colors flex items-center gap-2
                      ${
                        floor.id === currentFloorId
                          ? "bg-slate-700 text-white"
                          : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                      }
                    `}
                  >
                    <HugeiconsIcon
                      icon={floor.id === currentFloorId ? SolidLine01Icon : DashedLine01Icon}
                      size={20}
                      color="currentColor"
                      strokeWidth={1}
                    />
                    {floor.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-700">
        <div className="text-xs text-slate-500">{currentBuilding?.name ?? "Aucun bâtiment"}</div>
      </div>
    </aside>
  );
}
