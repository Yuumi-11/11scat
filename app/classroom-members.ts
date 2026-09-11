export type ClassroomMember = { id: string; name: string; activity: string; todoNote?: string };
export type ClassroomProfile = { members: ClassroomMember[]; seats: string[]; font: string };
export type ClassroomSeat = 'tablet' | 'laptop';
export type ClassroomSettingsDraft = { seat: ClassroomSeat | null };
export type ClassroomAction = { action: 'save-settings'; seat: ClassroomSeat };
export const CLASSROOM_DEVICE_FONT = 'resource-rounded';

export function classroomSettingsDraft(profile: ClassroomProfile, identityId: string): ClassroomSettingsDraft {
  const index = profile.seats.indexOf(identityId);
  return { seat: index === 0 ? 'tablet' : index === 1 ? 'laptop' : null };
}

// Shared by the persisted store and the two-person local preview.
export function applyClassroomAction(profile: ClassroomProfile, identityId: string, action: ClassroomAction): ClassroomProfile {
  if (!profile.seats.includes(identityId)) throw new Error('仅座位成员可以修改设置');
  if (action.action !== 'save-settings' || !['tablet', 'laptop'].includes(action.seat)) throw new Error('座位选项无效');
  if (profile.seats.length !== 2 || new Set(profile.seats).size !== 2) throw new Error('等待另一位成员加入');
  const other = profile.seats.find(id => id !== identityId)!;
  const seats = action.seat === 'tablet' ? [identityId, other] : [other, identityId];
  // Save the requested destination, so retrying a save never swaps the pair back.
  return { members: profile.members, seats, font: CLASSROOM_DEVICE_FONT };
}
export function memberDevices(identityId: string, peers: string[], identities: Record<string, string>) {
  return [...new Set(peers)].filter(peer => identities[peer] === identityId);
}
export function fixedClassroomSeats(profile: ClassroomProfile) {
  return [0, 1].map(index => profile.members.find(member => member.id === profile.seats[index]) || { id: '', name: '同桌', activity: '' });
}
