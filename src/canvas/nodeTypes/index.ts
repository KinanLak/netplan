import RackNode from "./RackNode";
import SwitchNode from "./SwitchNode";
import PcNode from "./PcNode";
import WallPortNode from "./WallPortNode";

export const nodeTypes = {
    rack: RackNode,
    switch: SwitchNode,
    pc: PcNode,
    "wall-port": WallPortNode,
};
