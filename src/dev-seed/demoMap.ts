// The map `dev:seed` loads into a development backend: two floors of a
// fictional building, sized like a real small office so the UI is exercised
// with rooms, racks, switch ports, sockets and cables. Every name, address and
// MAC is invented (documentation IP ranges, locally administered MACs).
//
// Convex bundles this file for `convex/dev.ts`, so it uses relative imports
// only; the `@/` alias does not resolve there.
import { numberedPorts, portIdOf } from "../devices/ports";
import type { BatchSubOperation } from "../map-engine/types";
import type {
  Cable,
  CableEnd,
  CableId,
  DeviceId,
  DeviceStatus,
  FloorId,
  NewDevice,
  Port,
  Position,
  WallColor,
  WallId,
  WallSegment,
} from "../types/map";

const GRID_SIZE = 20;

export interface DemoFloor {
  id: FloorId;
  name: string;
  order: number;
  /**
   * One batch: walls, then devices, each with the cables to the devices
   * before it.
   */
  operations: Array<BatchSubOperation>;
}

interface PcInput {
  key: string;
  name: string;
  position: Position;
  status: DeviceStatus;
  lastUser?: string;
}

const createFloorBuilder = (floorId: FloorId, slug: string) => {
  const walls = new Map<string, WallSegment>();
  const devices: Array<NewDevice> = [];
  const ports = new Map<DeviceId, Array<Port>>();
  const cables = new Map<DeviceId, Array<Cable>>();
  let cableCount = 0;
  let hostCount = 0;

  const deviceId = (key: string) => `device:demo:${slug}:${key}` as DeviceId;

  const addDevice = (
    device: Omit<NewDevice, "id" | "floorId" | "macs"> & {
      key: string;
      macs?: Array<string>;
    },
  ) => {
    const { key, macs = [], ...rest } = device;
    const id = deviceId(key);
    // A device with a hostname is named after it, as the server would name
    // it (B10); the name given stays only for those without one.
    devices.push({
      id,
      floorId,
      macs,
      ...rest,
      name: rest.hostname ?? rest.name,
    });
    return id;
  };

  return {
    /**
     * A closed room between two wall-cell centres (odd multiples of half a
     * cell), as the room tool draws it, minus the cells listed in `doors`.
     */
    room(
      from: Position,
      to: Position,
      color: WallColor,
      doors: Array<Position> = [],
    ) {
      const isDoor = (cell: Position) =>
        doors.some((door) => door.x === cell.x && door.y === cell.y);
      const cells: Array<Position> = [];
      for (let x = from.x; x <= to.x; x += GRID_SIZE) {
        cells.push({ x, y: from.y }, { x, y: to.y });
      }
      for (let y = from.y; y <= to.y; y += GRID_SIZE) {
        cells.push({ x: from.x, y }, { x: to.x, y });
      }
      for (const cell of cells) {
        if (isDoor(cell)) continue;
        const geometryKey = `${cell.x}:${cell.y}:${cell.x}:${cell.y}`;
        if (walls.has(geometryKey)) continue;
        walls.set(geometryKey, {
          id: `wall:demo:${slug}:${cell.x}:${cell.y}` as WallId,
          floorId,
          start: cell,
          end: cell,
          color,
          geometryKey,
        });
      }
    },

    rack(key: string, name: string, position: Position, units: 42 | 24 | 12) {
      const height = { 42: 160, 24: 120, 12: 80 }[units];
      const model = {
        42: "42U Standard Cabinet",
        24: "24U Compact Cabinet",
        12: "12U Wall Mount",
      }[units];
      return addDevice({
        key,
        type: "rack",
        name,
        position,
        size: { width: 80, height },
        model,
        metadata: { status: "unknown" },
      });
    },

    /**
     * The first `activePorts` ports are up, the others down, and a device is
     * seen on the first `seenPorts`.
     */
    switch(
      key: string,
      name: string,
      position: Position,
      options: {
        model: string;
        ip: string;
        portCount: number;
        portName: (n: number) => string;
        activePorts: number;
        seenPorts: number;
      },
    ) {
      const compact = options.portCount <= 8;
      const id = addDevice({
        key,
        type: "switch",
        name,
        hostname: `sw-demo-${key}`,
        position,
        size: compact ? { width: 160, height: 40 } : { width: 200, height: 60 },
        model: options.model,
        ip: options.ip,
        metadata: {
          status: "up",
        },
      });
      ports.set(
        id,
        numberedPorts(id, "interface", options.portCount, options.portName).map(
          (port) => ({
            ...port,
            status: port.order <= options.activePorts ? "up" : "down",
            ...(port.order <= options.seenPorts && { seen: true as const }),
          }),
        ),
      );
      return id;
    },

    socket(key: string, name: string, position: Position) {
      return addDevice({
        key,
        type: "wall-port",
        name,
        position,
        size: { width: 40, height: 40 },
        model: "RJ45 Cat6",
        metadata: { status: "unknown" },
      });
    },

    patchPanel(key: string, name: string, position: Position) {
      return addDevice({
        key,
        type: "patch-panel",
        name,
        position,
        size: { width: 200, height: 40 },
        model: "Panneau 24 ports Cat6",
        metadata: {},
      });
    },

    endpoint(
      key: string,
      name: string,
      position: Position,
      options: { model: string; ip: string; mac: string },
    ) {
      return addDevice({
        key,
        type: "endpoint",
        name,
        hostname: `demo-${key}`,
        position,
        size: { width: 80, height: 80 },
        model: options.model,
        ip: options.ip,
        macs: [options.mac],
        metadata: { status: "up" },
      });
    },

    pc(input: PcInput, ipPrefix: string, macPrefix: string) {
      hostCount += 1;
      const suffix = hostCount.toString(16).padStart(2, "0");
      return addDevice({
        key: input.key,
        type: "pc",
        name: input.name,
        hostname: `pc-demo-${input.key}`,
        position: input.position,
        size: { width: 80, height: 80 },
        model:
          hostCount % 2 === 0 ? "HP EliteDesk 800 G6" : "Dell OptiPlex 7090",
        ip: `${ipPrefix}.${hostCount + 10}`,
        macs: [`${macPrefix}:${suffix}`],
        metadata: {
          status: input.status,
          lastUser: input.lastUser,
        },
      });
    },

    /**
     * A cable between two ports. It travels with whichever device comes
     * last, since `device.create` lays cables to devices that exist.
     */
    cable(a: CableEnd, b: CableEnd) {
      cableCount += 1;
      const order = (end: CableEnd) =>
        devices.findIndex((device) => device.id === end.deviceId);
      const owner = order(a) > order(b) ? a.deviceId : b.deviceId;
      const list = cables.get(owner) ?? [];
      list.push({ id: `cable:demo:${slug}:${cableCount}` as CableId, a, b });
      cables.set(owner, list);
    },

    operations(): Array<BatchSubOperation> {
      return [
        { kind: "walls.add", walls: [...walls.values()] },
        ...devices.map((device) => ({
          kind: "device.create" as const,
          device,
          ...(ports.has(device.id) ? { ports: ports.get(device.id) } : {}),
          ...(cables.has(device.id) ? { cables: cables.get(device.id) } : {}),
        })),
      ];
    },
  };
};

const end = (deviceId: DeviceId, kind: Port["kind"], n: number): CableEnd => ({
  deviceId,
  portId: portIdOf(deviceId, kind, n),
});

const cisco = (n: number) => `Gi1/0/${n}`;

const groundFloor = (floorId: FloorId): Array<BatchSubOperation> => {
  const floor = createFloorBuilder(floorId, "rdc");
  const pc = (input: PcInput) =>
    floor.pc(input, "198.51.100", "02:6e:70:00:01");

  floor.room({ x: 10, y: 10 }, { x: 490, y: 330 }, "concrete", [
    { x: 410, y: 330 },
    { x: 430, y: 330 },
  ]);
  floor.rack("baie-a1", "Baie A1", { x: 40, y: 40 }, 42);
  floor.rack("baie-a2", "Baie A2", { x: 140, y: 40 }, 24);
  const core = floor.switch(
    "coeur",
    "Cœur de réseau",
    { x: 260, y: 60 },
    {
      model: "Cisco Catalyst 9300-24P",
      ip: "192.0.2.1",
      portCount: 24,
      portName: cisco,
      activePorts: 1,
      seenPorts: 0,
    },
  );
  const access = floor.switch(
    "acces-rdc",
    "Accès RDC",
    { x: 260, y: 160 },
    {
      model: "Cisco Catalyst 9200-48",
      ip: "192.0.2.11",
      portCount: 48,
      portName: cisco,
      activePorts: 10,
      seenPorts: 6,
    },
  );
  floor.cable(end(core, "interface", 1), end(access, "interface", 48));
  // Ground-floor sockets go through the patch panel; upstairs they are
  // cabled to the switch directly.
  const panel = floor.patchPanel("brassage-a", "Brassage A", {
    x: 260,
    y: 260,
  });
  const throughPanel = (number: number, socket: DeviceId) => {
    floor.cable(end(access, "interface", number), end(panel, "front", number));
    floor.cable(end(panel, "rear", number), end(socket, "front", 1));
  };

  floor.room({ x: 530, y: 10 }, { x: 1130, y: 410 }, "sand", [
    { x: 530, y: 350 },
    { x: 530, y: 370 },
  ]);
  const users = [
    "c.martin",
    "l.bernard",
    "s.petit",
    undefined,
    "a.moreau",
    "j.laurent",
    undefined,
    "m.roux",
  ];
  const statuses: Array<DeviceStatus> = [
    "up",
    "up",
    "down",
    "unknown",
    "up",
    "up",
    "up",
    "down",
  ];
  [580, 720, 860, 1000].forEach((x, column) => {
    for (const [row, socketY, pcY] of [
      [0, 20, 100],
      [1, 360, 260],
    ] as const) {
      const index = row * 4 + column;
      const number = index + 1;
      const socket = floor.socket(
        `prise-${number}`,
        `Prise B-${number.toString().padStart(2, "0")}`,
        {
          x: x + 20,
          y: socketY,
        },
      );
      pc({
        key: `poste-${number}`,
        name: `Poste ${number}`,
        position: { x, y: pcY },
        status: statuses[index],
        lastUser: users[index],
      });
      throughPanel(number, socket);
    }
  });

  floor.room({ x: 10, y: 370 }, { x: 490, y: 650 }, "slate", [
    { x: 450, y: 370 },
    { x: 470, y: 370 },
  ]);
  const meetingSocket = floor.socket("prise-reunion", "Prise Réunion", {
    x: 240,
    y: 600,
  });
  pc({
    key: "reunion",
    name: "PC Salle de réunion",
    position: { x: 220, y: 500 },
    status: "unknown",
  });
  throughPanel(9, meetingSocket);
  const printerSocket = floor.socket("prise-imprimante", "Prise Imprimante", {
    x: 60,
    y: 600,
  });
  floor.endpoint(
    "imprimante",
    "Imprimante",
    { x: 40, y: 500 },
    {
      model: "Brother HL-L6210DW",
      ip: "198.51.100.40",
      mac: "02:6e:70:00:03:01",
    },
  );
  throughPanel(10, printerSocket);

  return floor.operations();
};

const firstFloor = (floorId: FloorId): Array<BatchSubOperation> => {
  const floor = createFloorBuilder(floorId, "etage-1");
  const pc = (input: PcInput) =>
    floor.pc(input, "198.51.100", "02:6e:70:00:02");

  floor.room({ x: 10, y: 10 }, { x: 650, y: 330 }, "sand", [
    { x: 590, y: 330 },
    { x: 610, y: 330 },
  ]);
  floor.rack("baie-b1", "Baie B1", { x: 40, y: 40 }, 12);
  const access = floor.switch(
    "acces-e1",
    "Accès étage 1",
    { x: 40, y: 140 },
    {
      model: "UniFi Switch 8",
      ip: "192.0.2.21",
      portCount: 8,
      portName: (n) => `Port ${n}`,
      activePorts: 6,
      seenPorts: 4,
    },
  );
  const users = [
    "p.garnier",
    "e.faure",
    undefined,
    "n.girard",
    "t.andre",
    undefined,
  ];
  const statuses: Array<DeviceStatus> = [
    "up",
    "up",
    "down",
    "up",
    "unknown",
    "up",
  ];
  [240, 380, 520].forEach((x, column) => {
    for (const [row, socketY, pcY] of [
      [0, 20, 100],
      [1, 280, 200],
    ] as const) {
      const index = row * 3 + column;
      const number = index + 1;
      const socket = floor.socket(
        `prise-${number}`,
        `Prise C-${number.toString().padStart(2, "0")}`,
        {
          x: x + 20,
          y: socketY,
        },
      );
      pc({
        key: `poste-e1-${number}`,
        name: `Poste ${number + 10}`,
        position: { x, y: pcY },
        status: statuses[index],
        lastUser: users[index],
      });
      floor.cable(end(access, "interface", number), end(socket, "front", 1));
    }
  });

  floor.room({ x: 690, y: 10 }, { x: 970, y: 250 }, "slate", [
    { x: 690, y: 190 },
    { x: 690, y: 210 },
  ]);
  floor.socket("prise-pause", "Prise Salle de pause", { x: 900, y: 40 });

  return floor.operations();
};

export const DEMO_BUILDING = {
  id: "building:demo:a",
  name: "Bâtiment A",
} as const;

export const buildDemoFloors = (): Array<DemoFloor> => {
  const ground = "floor:demo:a:rdc" as FloorId;
  const first = "floor:demo:a:etage-1" as FloorId;
  return [
    {
      id: ground,
      name: "Rez-de-chaussée",
      order: 0,
      operations: groundFloor(ground),
    },
    { id: first, name: "Étage 1", order: 1, operations: firstFloor(first) },
  ];
};
