import type { DeviceMetadata, DeviceType, Size } from "@/types/map";

export interface AvailableDevice {
  id: string;
  type: DeviceType;
  name: string;
  hostname?: string;
  model?: string;
  size: Size;
  metadata: DeviceMetadata;
}

export const availableDevicesCatalog: Record<
  DeviceType,
  Array<AvailableDevice>
> = {
  rack: [
    {
      id: "catalog-rack-1",
      type: "rack",
      name: "Rack 42U Standard",
      model: "42U Standard Cabinet",
      size: { width: 80, height: 160 },
      metadata: { status: "unknown" },
    },
    {
      id: "catalog-rack-2",
      type: "rack",
      name: "Rack 24U Compact",
      model: "24U Compact Cabinet",
      size: { width: 80, height: 120 },
      metadata: { status: "unknown" },
    },
    {
      id: "catalog-rack-3",
      type: "rack",
      name: "Rack 12U Mini",
      model: "12U Wall Mount",
      size: { width: 80, height: 80 },
      metadata: { status: "unknown" },
    },
  ],
  switch: [
    {
      id: "catalog-switch-1",
      type: "switch",
      name: "Cisco Catalyst 9300-24P",
      hostname: "sw-new-01",
      model: "Cisco Catalyst 9300-24P",
      size: { width: 200, height: 60 },
      metadata: {
        status: "unknown",
      },
    },
    {
      id: "catalog-switch-2",
      type: "switch",
      name: "Cisco Catalyst 9200-48",
      hostname: "sw-new-02",
      model: "Cisco Catalyst 9200-48",
      size: { width: 200, height: 60 },
      metadata: {
        status: "unknown",
      },
    },
    {
      id: "catalog-switch-3",
      type: "switch",
      name: "HP ProCurve 2920-24G",
      hostname: "sw-hp-01",
      model: "HP ProCurve 2920-24G",
      size: { width: 200, height: 60 },
      metadata: {
        status: "unknown",
      },
    },
    {
      id: "catalog-switch-4",
      type: "switch",
      name: "Ubiquiti UniFi 8-Port",
      hostname: "sw-ubnt-01",
      model: "UniFi Switch 8",
      size: { width: 160, height: 40 },
      metadata: {
        status: "unknown",
      },
    },
  ],
  "patch-panel": [
    {
      id: "catalog-patch-panel-1",
      type: "patch-panel",
      name: "Panneau 24 ports Cat6",
      model: "Patch panel 24 x RJ45 Cat6",
      size: { width: 200, height: 40 },
      metadata: {},
    },
  ],
  pc: [
    {
      id: "catalog-pc-1",
      type: "pc",
      name: "Dell OptiPlex 7090",
      hostname: "pc-new-01",
      model: "Dell OptiPlex 7090",
      size: { width: 80, height: 80 },
      metadata: { status: "unknown" },
    },
    {
      id: "catalog-pc-2",
      type: "pc",
      name: "HP EliteDesk 800 G6",
      hostname: "pc-new-02",
      model: "HP EliteDesk 800 G6",
      size: { width: 80, height: 80 },
      metadata: { status: "unknown" },
    },
    {
      id: "catalog-pc-3",
      type: "pc",
      name: "Lenovo ThinkCentre M720",
      hostname: "pc-new-03",
      model: "Lenovo ThinkCentre M720",
      size: { width: 80, height: 80 },
      metadata: { status: "unknown" },
    },
    {
      id: "catalog-pc-4",
      type: "pc",
      name: 'iMac 24" M1',
      hostname: "mac-new-01",
      model: 'iMac 24" M1',
      size: { width: 80, height: 80 },
      metadata: { status: "unknown" },
    },
  ],
  endpoint: [
    {
      id: "catalog-endpoint-1",
      type: "endpoint",
      name: "Terminal",
      size: { width: 80, height: 80 },
      metadata: { status: "unknown" },
    },
    {
      id: "catalog-endpoint-2",
      type: "endpoint",
      name: "Imprimante réseau",
      size: { width: 80, height: 80 },
      metadata: { status: "unknown" },
    },
    {
      id: "catalog-endpoint-3",
      type: "endpoint",
      name: "Téléphone IP",
      size: { width: 80, height: 80 },
      metadata: { status: "unknown" },
    },
  ],
  "wall-port": [
    {
      id: "catalog-wp-1",
      type: "wall-port",
      name: "Prise RJ45 Cat6",
      model: "RJ45 Cat6",
      size: { width: 40, height: 40 },
      metadata: { status: "unknown" },
    },
    {
      id: "catalog-wp-2",
      type: "wall-port",
      name: "Prise RJ45 Cat6a",
      model: "RJ45 Cat6a",
      size: { width: 40, height: 40 },
      metadata: { status: "unknown" },
    },
    {
      id: "catalog-wp-3",
      type: "wall-port",
      name: "Prise Double RJ45",
      model: "Double RJ45 Cat6",
      size: { width: 40, height: 40 },
      metadata: { status: "unknown" },
    },
  ],
};

export const getAllAvailableDevices = (): Array<AvailableDevice> => {
  return Object.values(availableDevicesCatalog).flat();
};
