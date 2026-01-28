import type { DeviceType, DeviceMetadata, Size } from "@/types/map";

// Représente un device disponible dans le catalogue NetBox/LibreNMS
export interface AvailableDevice {
    id: string;
    type: DeviceType;
    name: string;
    hostname?: string;
    model?: string;
    ip?: string;
    size: Size;
    metadata: DeviceMetadata;
}

// Devices disponibles par type (simulant les données NetBox/LibreNMS)
export const availableDevicesCatalog: Record<DeviceType, AvailableDevice[]> = {
    rack: [
        {
            id: "catalog-rack-1",
            type: "rack",
            name: "Rack 42U Standard",
            model: "42U Standard Cabinet",
            size: { width: 80, height: 160 },
            metadata: { model: "42U Standard Cabinet", status: "unknown" },
        },
        {
            id: "catalog-rack-2",
            type: "rack",
            name: "Rack 24U Compact",
            model: "24U Compact Cabinet",
            size: { width: 80, height: 120 },
            metadata: { model: "24U Compact Cabinet", status: "unknown" },
        },
        {
            id: "catalog-rack-3",
            type: "rack",
            name: "Rack 12U Mini",
            model: "12U Wall Mount",
            size: { width: 80, height: 80 },
            metadata: { model: "12U Wall Mount", status: "unknown" },
        },
    ],
    switch: [
        {
            id: "catalog-switch-1",
            type: "switch",
            name: "Cisco Catalyst 9300-24P",
            hostname: "sw-new-01",
            model: "Cisco Catalyst 9300-24P",
            ip: "192.168.1.x",
            size: { width: 200, height: 60 },
            metadata: {
                model: "Cisco Catalyst 9300-24P",
                status: "unknown",
                ports: Array.from({ length: 24 }, (_, i) => ({
                    id: `port-${i + 1}`,
                    number: i + 1,
                    status: "unknown" as const,
                })),
            },
        },
        {
            id: "catalog-switch-2",
            type: "switch",
            name: "Cisco Catalyst 9200-48",
            hostname: "sw-new-02",
            model: "Cisco Catalyst 9200-48",
            ip: "192.168.1.x",
            size: { width: 200, height: 60 },
            metadata: {
                model: "Cisco Catalyst 9200-48",
                status: "unknown",
                ports: Array.from({ length: 48 }, (_, i) => ({
                    id: `port-${i + 1}`,
                    number: i + 1,
                    status: "unknown" as const,
                })),
            },
        },
        {
            id: "catalog-switch-3",
            type: "switch",
            name: "HP ProCurve 2920-24G",
            hostname: "sw-hp-01",
            model: "HP ProCurve 2920-24G",
            ip: "192.168.1.x",
            size: { width: 200, height: 60 },
            metadata: {
                model: "HP ProCurve 2920-24G",
                status: "unknown",
                ports: Array.from({ length: 24 }, (_, i) => ({
                    id: `port-${i + 1}`,
                    number: i + 1,
                    status: "unknown" as const,
                })),
            },
        },
        {
            id: "catalog-switch-4",
            type: "switch",
            name: "Ubiquiti UniFi 8-Port",
            hostname: "sw-ubnt-01",
            model: "UniFi Switch 8",
            ip: "192.168.1.x",
            size: { width: 160, height: 40 },
            metadata: {
                model: "UniFi Switch 8",
                status: "unknown",
                ports: Array.from({ length: 8 }, (_, i) => ({
                    id: `port-${i + 1}`,
                    number: i + 1,
                    status: "unknown" as const,
                })),
            },
        },
    ],
    pc: [
        {
            id: "catalog-pc-1",
            type: "pc",
            name: "Dell OptiPlex 7090",
            hostname: "pc-new-01",
            model: "Dell OptiPlex 7090",
            ip: "192.168.1.x",
            size: { width: 80, height: 80 },
            metadata: { model: "Dell OptiPlex 7090", status: "unknown" },
        },
        {
            id: "catalog-pc-2",
            type: "pc",
            name: "HP EliteDesk 800 G6",
            hostname: "pc-new-02",
            model: "HP EliteDesk 800 G6",
            ip: "192.168.1.x",
            size: { width: 80, height: 80 },
            metadata: { model: "HP EliteDesk 800 G6", status: "unknown" },
        },
        {
            id: "catalog-pc-3",
            type: "pc",
            name: "Lenovo ThinkCentre M720",
            hostname: "pc-new-03",
            model: "Lenovo ThinkCentre M720",
            ip: "192.168.1.x",
            size: { width: 80, height: 80 },
            metadata: { model: "Lenovo ThinkCentre M720", status: "unknown" },
        },
        {
            id: "catalog-pc-4",
            type: "pc",
            name: 'iMac 24" M1',
            hostname: "mac-new-01",
            model: 'iMac 24" M1',
            ip: "192.168.1.x",
            size: { width: 80, height: 80 },
            metadata: { model: 'iMac 24" M1', status: "unknown" },
        },
    ],
    "wall-port": [
        {
            id: "catalog-wp-1",
            type: "wall-port",
            name: "Prise RJ45 Cat6",
            size: { width: 40, height: 40 },
            metadata: { model: "RJ45 Cat6", status: "unknown" },
        },
        {
            id: "catalog-wp-2",
            type: "wall-port",
            name: "Prise RJ45 Cat6a",
            size: { width: 40, height: 40 },
            metadata: { model: "RJ45 Cat6a", status: "unknown" },
        },
        {
            id: "catalog-wp-3",
            type: "wall-port",
            name: "Prise Double RJ45",
            size: { width: 40, height: 40 },
            metadata: { model: "Double RJ45 Cat6", status: "unknown" },
        },
    ],
};

// Helper pour obtenir la liste plate de tous les devices disponibles
export const getAllAvailableDevices = (): AvailableDevice[] => {
    return Object.values(availableDevicesCatalog).flat();
};
