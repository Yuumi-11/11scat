import type { RoomBoard } from './Whiteboard';

export type ClassroomBoards = { boards: RoomBoard[]; activeBoardId: string };
export const orderClassroomBoards = (boards: RoomBoard[]) => [...boards].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
export function replaceClassroomBoards(current: ClassroomBoards, boards: RoomBoard[]): ClassroomBoards {
  if (!current.activeBoardId || boards.some(board => board.id === current.activeBoardId)) return { boards, activeBoardId: current.activeBoardId };
  const previous = orderClassroomBoards(current.boards);
  const index = previous.findIndex(board => board.id === current.activeBoardId);
  const remaining = new Set(boards.map(board => board.id));
  const predecessor = previous.slice(0, Math.max(0, index)).findLast(board => remaining.has(board.id));
  return { boards, activeBoardId: predecessor?.id || '' };
}
export function addAndSelectBoard(current: ClassroomBoards, board: RoomBoard): ClassroomBoards {
  if (current.boards.length >= 12 || current.boards.some(item => item.id === board.id)) return current;
  return { boards: [...current.boards, board], activeBoardId: board.id };
}
export function adjacentBoardId(boards: RoomBoard[], activeId: string, direction: -1 | 1) {
  const ids = ['', ...orderClassroomBoards(boards).map(board => board.id)];
  const index = Math.max(0, ids.indexOf(activeId));
  return ids[Math.max(0, Math.min(ids.length - 1, index + direction))];
}
