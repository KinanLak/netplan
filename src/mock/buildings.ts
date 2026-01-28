import type { Building } from "@/types/map";

export const mockBuildings: Building[] = [
    {
        id: "building-1",
        name: "Bâtiment Principal",
        floors: [
            {
                id: "floor-1",
                name: "Rez-de-chaussée",
            },
            {
                id: "floor-2",
                name: "Étage 1",
            },
        ],
    },
];
