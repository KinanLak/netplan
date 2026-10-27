import { ViewportPortal, useReactFlow, useStore } from "@xyflow/react";
import type { ReactFlowState } from "@xyflow/react";
import { useEffect, useEffectEvent, useState } from "react";
import { toast } from "sonner";
import { cableDropResult, cableStart } from "@/canvas/cableDrawing";
import type { CableDrop } from "@/canvas/cableDrawing";
import { TRACED_ON_ASK } from "@/canvas/cablePaths";
import { PORT_ID_ATTRIBUTE, portIdAt } from "@/canvas/hooks/useCableGrip";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { endLabel, portLabel } from "@/devices/portState";
import { useCableCommands } from "@/devices/useCableCommands";
import { createStandaloneObjectId } from "@/lib/identity";
import { useMapDocumentActions } from "@/map-session/useMapDocument";
import { useMapStore } from "@/store/useMapStore";
import type {
  Cable,
  CableDraft,
  DeviceId,
  DeviceType,
  Port,
  Position,
} from "@/types/map";

// One toast however often a refusal is said, as a mount effect may run twice.
const REFUSAL_TOAST = "cable-draft-refusal";

type PortPick = {
  deviceId: DeviceId;
  /** Its type, which says how its ports are named. */
  deviceType: DeviceType;
  ports: Array<Port>;
  /** Where the cable was dropped, on screen and on the plan. */
  client: Position;
  flow: Position;
};

/**
 * The device or port under a point of the screen, if any. Only the topmost
 * element counts: a drawer or dialog over the plan hides what lies beneath.
 */
const dropAt = (client: Position): CableDrop | null => {
  const element = window.document.elementFromPoint(client.x, client.y);
  const deviceId = element
    ?.closest(".react-flow__node")
    ?.getAttribute("data-id");
  if (!element || !deviceId) return null;
  const portId = portIdAt(element);
  return { deviceId: deviceId as DeviceId, ...(portId ? { portId } : {}) };
};

/**
 * A port pressed on the map (ADR 0025): a free one draws a cable, a line
 * from its device to the pointer until it is dropped on another device,
 * then the free port to cable there when the device has several. A cabled
 * one offers to unplug its cable.
 */
export function CableDraftLayer() {
  const draft = useMapStore((s) => s.cableDraft);
  return draft ? <PressedPort key={draft.portId} draft={draft} /> : null;
}

function PressedPort({ draft }: { draft: CableDraft }) {
  const { getDocument } = useMapDocumentActions();
  // What a press does is settled when it happens: another person's edit
  // does not turn a cable being drawn into a menu.
  const [start] = useState(() => cableStart(draft, getDocument()));
  switch (start.kind) {
    case "draw":
      return <DrawingCable draft={draft} />;
    case "unplug":
      return (
        <UnplugMenu
          portId={draft.portId}
          cable={start.cable}
          label={start.label}
        />
      );
    case "refused":
      return <RefusedStart reason={start.reason} />;
  }
}

function RefusedStart({ reason }: { reason: string }) {
  const setCableDraft = useMapStore((s) => s.setCableDraft);
  const refuse = useEffectEvent(() => {
    toast(reason, { id: REFUSAL_TOAST });
    setCableDraft(null);
  });
  useEffect(() => refuse(), []);
  return null;
}

/** The cable plugged into a pressed port, and a way to unplug it. */
function UnplugMenu({
  portId,
  cable,
  label,
}: {
  portId: CableDraft["portId"];
  cable: Cable;
  label: string;
}) {
  const setCableDraft = useMapStore((s) => s.setCableDraft);
  const { unplug } = useCableCommands();
  const [anchor, setAnchor] = useState<Element | null>(null);

  // The menu opens once the press is released, so that the release does not
  // count as a press outside it.
  const open = useEffectEvent(() => {
    const port = window.document.querySelector(
      `[${PORT_ID_ATTRIBUTE}="${CSS.escape(portId)}"]`,
    );
    if (port) setAnchor(port);
    else setCableDraft(null);
  });
  const cancel = useEffectEvent(() => setCableDraft(null));
  useEffect(() => {
    const up = () => open();
    const abandon = () => cancel();
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", abandon, { once: true });
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", abandon);
    };
  }, []);

  if (!anchor) return null;
  return (
    <Popover
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) setCableDraft(null);
      }}
    >
      <PopoverContent anchor={anchor} className="w-auto max-w-80 gap-3 p-3">
        <p>{label}</p>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            setCableDraft(null);
            void unplug(cable.id, label);
          }}
        >
          Débrancher
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function DrawingCable({ draft }: { draft: CableDraft }) {
  const reactFlow = useReactFlow();
  const { getDocument } = useMapDocumentActions();
  const setCableDraft = useMapStore((s) => s.setCableDraft);
  const showCables = useMapStore((s) => s.showCables);
  const { plug } = useCableCommands();
  const [pointer, setPointer] = useState<Position | null>(null);
  const [pick, setPick] = useState<PortPick | null>(null);

  const from = useStore(
    (state: ReactFlowState) => {
      const node = state.nodeLookup.get(draft.deviceId);
      if (!node) return null;
      const { x, y } = node.internals.positionAbsolute;
      return {
        x: x + (node.measured.width ?? 0) / 2,
        y: y + (node.measured.height ?? 0) / 2,
      };
    },
    (a, b) => a?.x === b?.x && a?.y === b?.y,
  );

  const connect = async (deviceId: DeviceId, port: Port) => {
    setCableDraft(null);
    const document = getDocument();
    const fromDevice = document.devices.find(({ id }) => id === draft.deviceId);
    const fromPort = document.ports.find(({ id }) => id === draft.portId);
    const toDevice = document.devices.find(({ id }) => id === deviceId);
    if (!fromDevice || !fromPort || !toDevice) return;
    const refusal = await plug(
      {
        id: createStandaloneObjectId("cable"),
        a: { deviceId: fromDevice.id, portId: fromPort.id },
        b: { deviceId: toDevice.id, portId: port.id },
      },
      `${endLabel(fromDevice.name, fromPort, fromDevice.type)} ↔ ${endLabel(toDevice.name, port, toDevice.type)}`,
    );
    if (refusal) {
      toast.error(refusal);
      return;
    }
    // The new cable shows at once, with the others of its switch or panel.
    const shown = [fromDevice, toDevice].find(({ type }) =>
      TRACED_ON_ASK.has(type),
    );
    if (shown) showCables(shown.id);
  };

  const onMove = useEffectEvent((event: PointerEvent) => {
    setPointer(
      reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    );
  });

  const onDrop = useEffectEvent((event: PointerEvent) => {
    const client = { x: event.clientX, y: event.clientY };
    const drop = dropAt(client);
    const result = cableDropResult(draft, drop, getDocument());
    switch (result.kind) {
      case "none":
        setCableDraft(null);
        return;
      case "refused":
        toast(result.reason, { id: REFUSAL_TOAST });
        setCableDraft(null);
        return;
      case "connect":
        if (drop) void connect(drop.deviceId, result.port);
        return;
      case "pick":
        if (!drop) return;
        setPick({
          deviceId: drop.deviceId,
          deviceType: result.deviceType,
          ports: result.ports,
          client,
          flow: reactFlow.screenToFlowPosition(client),
        });
    }
  });

  const onCancel = useEffectEvent(() => setCableDraft(null));

  // The pointer is followed across the whole window until the cable is
  // dropped; then the picker, if any, takes over.
  const isDragging = pick === null;
  useEffect(() => {
    if (!isDragging) return;
    const move = (event: PointerEvent) => onMove(event);
    const up = (event: PointerEvent) => onDrop(event);
    const cancel = () => onCancel();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [isDragging]);

  const to = pick?.flow ?? pointer;

  return (
    <>
      {from && to ? (
        <ViewportPortal>
          <svg
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 overflow-visible"
            width={1}
            height={1}
            data-testid="cable-draft"
          >
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className="stroke-primary"
              strokeWidth={2.5}
              strokeDasharray="8 6"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </ViewportPortal>
      ) : null}
      {pick ? (
        <Popover
          open
          onOpenChange={(open) => {
            if (!open) setCableDraft(null);
          }}
        >
          <PopoverContent
            anchor={{
              getBoundingClientRect: () =>
                DOMRect.fromRect({ x: pick.client.x, y: pick.client.y }),
            }}
            align="start"
            className="w-56 p-0"
          >
            <Command>
              <CommandInput placeholder="Port libre…" autoFocus />
              <CommandList>
                <CommandEmpty>Aucun port ne correspond.</CommandEmpty>
                {pick.ports.map((port) => (
                  <CommandItem
                    key={port.id}
                    value={portLabel(port, pick.deviceType)}
                    onSelect={() => void connect(pick.deviceId, port)}
                  >
                    <span className="font-mono">
                      {portLabel(port, pick.deviceType)}
                    </span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : null}
    </>
  );
}
