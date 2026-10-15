// The map `dev:seed` loads into a development backend: two floors of a
// fictional building, sized like a real small office so the UI is exercised
// with rooms, racks, switch ports, sockets and cables. Every name, address and
// MAC is invented (documentation IP ranges, locally administered MACs).
//
// Convex bundles this file for `convex/dev.ts`, so it uses relative imports
// only; the `@/` alias does not resolve there.
import type { BatchSubOperation } from "../map-engine/types";
import type {
  Device,
  DeviceId,
  DeviceStatus,
  FloorId,
  LinkDoc,
  LinkId,
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
  /** One batch: walls first, then devices, then the links between them. */
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
  const devices: Array<Device> = [];
  const links: Array<LinkDoc> = [];
  let hostCount = 0;

  const deviceId = (key: string) => `device:demo:${slug}:${key}` as DeviceId;

  const addDevice = (
    device: Omit<Device, "id" | "floorId"> & { key: string },
  ) => {
    const { key, ...rest } = device;
    const id = deviceId(key);
    devices.push({ id, floorId, ...rest });
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
        metadata: { model, status: "unknown" },
      });
    },

    /** The first `activePorts` ports are up, the others down. */
    switch(
      key: string,
      name: string,
      position: Position,
      options: {
        model: string;
        ip: string;
        portCount: number;
        activePorts: number;
      },
    ) {
      const compact = options.portCount <= 8;
      return addDevice({
        key,
        type: "switch",
        name,
        hostname: `sw-demo-${key}`,
        position,
        size: compact ? { width: 160, height: 40 } : { width: 200, height: 60 },
        metadata: {
          model: options.model,
          ip: options.ip,
          status: "up",
          ports: Array.from({ length: options.portCount }, (_, index) => ({
            id: `port-${index + 1}`,
            number: index + 1,
            status: index < options.activePorts ? "up" : "down",
          })),
        },
      });
    },

    socket(key: string, name: string, position: Position) {
      return addDevice({
        key,
        type: "wall-port",
        name,
        position,
        size: { width: 40, height: 40 },
        metadata: { model: "RJ45 Cat6", status: "unknown" },
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
        metadata: {
          model:
            hostCount % 2 === 0 ? "HP EliteDesk 800 G6" : "Dell OptiPlex 7090",
          ip: `${ipPrefix}.${hostCount + 10}`,
          macs: [`${macPrefix}:${suffix}`],
          status: input.status,
          lastUser: input.lastUser,
        },
      });
    },

    link(
      from: DeviceId,
      to: DeviceId,
      ports: { from?: string; to?: string; label?: string } = {},
    ) {
      links.push({
        id: `link:demo:${slug}:${links.length + 1}` as LinkId,
        floorId,
        fromDeviceId: from,
        fromPort: ports.from,
        toDeviceId: to,
        toPort: ports.to,
        label: ports.label,
      });
    },

    operations(): Array<BatchSubOperation> {
      return [
        { kind: "walls.add", walls: [...walls.values()] },
        ...devices.map((device) => ({
          kind: "device.create" as const,
          device,
        })),
        ...links.map((link) => ({ kind: "link.create" as const, link })),
      ];
    },
  };
};

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
      activePorts: 1,
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
      activePorts: 9,
    },
  );
  floor.link(core, access, { from: "port-1", to: "port-48", label: "Uplink" });

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
      const computer = pc({
        key: `poste-${number}`,
        name: `Poste ${number}`,
        position: { x, y: pcY },
        status: statuses[index],
        lastUser: users[index],
      });
      floor.link(access, socket, { from: `port-${number}` });
      floor.link(socket, computer);
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
  const meetingPc = pc({
    key: "reunion",
    name: "PC Salle de réunion",
    position: { x: 220, y: 500 },
    status: "unknown",
  });
  floor.link(access, meetingSocket, { from: "port-9" });
  floor.link(meetingSocket, meetingPc);

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
      activePorts: 6,
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
      const computer = pc({
        key: `poste-e1-${number}`,
        name: `Poste ${number + 10}`,
        position: { x, y: pcY },
        status: statuses[index],
        lastUser: users[index],
      });
      floor.link(access, socket, { from: `port-${number}` });
      floor.link(socket, computer);
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
