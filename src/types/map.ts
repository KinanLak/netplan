// Device types for network equipment
export type DeviceType = "rack" | "switch" | "pc" | "wall-port";

export type DeviceStatus = "up" | "down" | "unknown";

export interface DeviceMetadata {
    ip?: string;
    status?: DeviceStatus;
    model?: string;
    ports?: PortInfo[];
    lastUser?: string;
    connectedDeviceIds?: string[];
}

export interface PortInfo {
    id: string;
    number: number;
    status: DeviceStatus;
    connectedTo?: string;
}

export interface Position {
    x: number;
    y: number;
}

export interface Size {
    width: number;
    height: number;
}

export interface Device {
    id: string;
    type: DeviceType;
    name: string;
    hostname?: string;
    floorId: string;
    position: Position;
    size: Size;
    metadata: DeviceMetadata;
}

// Building & Floor types
export interface Floor {
    id: string;
    name: string;
    backgroundImage?: string;
}

export interface Building {
    id: string;
    name: string;
    floors: Floor[];
}

// React Flow node data
export interface DeviceNodeData extends Device {
    selected?: boolean;
    highlighted?: boolean;
}

// Store types
export interface MapState {
    buildings: Building[];
    devices: Device[];
    currentBuildingId: string | null;
    currentFloorId: string | null;
    selectedDeviceId: string | null;
    isEditMode: boolean;
    highlightedDeviceIds: string[];
}

export interface MapActions {
    setCurrentBuilding: (buildingId: string) => void;
    setCurrentFloor: (floorId: string) => void;
    selectDevice: (deviceId: string | null) => void;
    addDevice: (device: Omit<Device, "id">) => void;
    updateDevicePosition: (deviceId: string, position: Position) => void;
    deleteDevice: (deviceId: string) => void;
    toggleEditMode: () => void;
    setHighlightedDevices: (deviceIds: string[]) => void;
    checkCollision: (deviceId: string, position: Position, size: Size) => boolean;
}

export type MapStore = MapState & MapActions;
