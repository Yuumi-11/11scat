import type { RoomBoard } from './Whiteboard';

export type ClassroomBoards = { boards: RoomBoard[]; activeBoardId: string };
export const orderClassroomBoards = (boards: RoomBoard[]) => [...boards].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
export function addAndSelectBoard(current: ClassroomBoards, board: RoomBoard): ClassroomBoards {
  if (current.boards.length >= 12 || current.boards.some(item => item.id === board.id)) return current;
  return { boards: [...current.boards, board], activeBoardId: board.id };
}
export function adjacentBoardId(boards: RoomBoard[], activeId: string, direction: -1 | 1) {
  const ids = ['', ...orderClassroomBoards(boards).map(board => board.id)];
  const index = Math.max(0, ids.indexOf(activeId));
  return ids[Math.max(0, Math.min(ids.length - 1, index + direction))];
}
