"use client";
import { useCallback, useState, type SetStateAction } from 'react';
import type { RoomBoard } from './Whiteboard';
import { addAndSelectBoard, type ClassroomBoards } from './classroom-boards';

// Keep a newly created board and its selection in the same React update.
export function useClassroomBoards() {
  const [state, setState] = useState<ClassroomBoards>({ boards: [], activeBoardId: '' });
  const setBoards = useCallback((update: SetStateAction<RoomBoard[]>) => setState(current => ({ ...current, boards: typeof update === 'function' ? update(current.boards) : update })), []);
  const setActiveBoardId = useCallback((update: SetStateAction<string>) => setState(current => ({ ...current, activeBoardId: typeof update === 'function' ? update(current.activeBoardId) : update })), []);
  const createAndSelect = useCallback((board: RoomBoard) => setState(current => addAndSelectBoard(current, board)), []);
  return { ...state, setBoards, setActiveBoardId, createAndSelect };
}
