import { useCallback, useEffect, useState } from "react";

interface UseCanvasDragStateResult {
  isCursorDragging: boolean;
  handleMoveStart: () => void;
  handleMoveEnd: () => void;
  handleNodeDragStart: () => void;
  handleNodeDragStop: () => void;
}

export function useCanvasDragState(): UseCanvasDragStateResult {
  const [isCursorDragging, setIsCursorDragging] = useState(false);

  const handleMoveStart = useCallback(() => {
    setIsCursorDragging(true);
  }, []);

  const handleMoveEnd = useCallback(() => {
    setIsCursorDragging(false);
  }, []);

  const handleNodeDragStart = useCallback(() => {
    setIsCursorDragging(true);
  }, []);

  const handleNodeDragStop = useCallback(() => {
    setIsCursorDragging(false);
  }, []);

  useEffect(() => {
    const handlePointerRelease = () => {
      setIsCursorDragging(false);
    };

    window.addEventListener("mouseup", handlePointerRelease);
    window.addEventListener("blur", handlePointerRelease);

    return () => {
      window.removeEventListener("mouseup", handlePointerRelease);
      window.removeEventListener("blur", handlePointerRelease);
    };
  }, []);

  return {
    isCursorDragging,
    handleMoveStart,
    handleMoveEnd,
    handleNodeDragStart,
    handleNodeDragStop,
  };
}
