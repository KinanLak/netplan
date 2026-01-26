import type { NodeTypes } from "@xyflow/react";
import RackNode from "./RackNode";
import SwitchNode from "./SwitchNode";
import PcNode from "./PcNode";
import WallPortNode from "./WallPortNode";

export const nodeTypes: NodeTypes = {
    rack: RackNode,
    switch: SwitchNode,
    pc: PcNode,
    "wall-port": WallPortNode,
};
