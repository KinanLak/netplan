import PcNode from "./PcNode";
import RackNode from "./RackNode";
import SwitchNode from "./SwitchNode";
import WallPortNode from "./WallPortNode";
import type { NodeTypes } from "@xyflow/react";

export const nodeTypes: NodeTypes = {
  rack: RackNode,
  switch: SwitchNode,
  pc: PcNode,
  "wall-port": WallPortNode,
};
