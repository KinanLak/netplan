import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { useEffect } from "react";

/**
 * Where a drawn cable meets a node (ADR 0029): a point at the middle of its
 * parent, which must be positioned. Nobody connects through it: cables are
 * drawn by `CableDraftLayer`, so it takes no pointer events.
 */
export function CableHandle({ id }: { id: string }) {
  return (
    <Handle
      id={id}
      type="source"
      position={Position.Top}
      isConnectable={false}
      className="cable-handle"
    />
  );
}

/**
 * React Flow measures handles when a node first renders; a switch whose
 * ports change, as when the cycle adopts LibreNMS's, must ask again.
 */
export function useRemeasuredHandles(
  nodeId: string,
  handleIds: ReadonlyArray<string>,
) {
  const updateNodeInternals = useUpdateNodeInternals();
  const key = handleIds.join(" ");
  useEffect(() => {
    updateNodeInternals(nodeId);
  }, [nodeId, key, updateNodeInternals]);
}
