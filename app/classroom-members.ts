export type ClassroomMember = { id: string; name: string; activity: string; todoNote?: string };
export type SeatExchange = { id: string; requesterId: string; recipientId: string; seats: string[]; createdAt: string };
export type ClassroomProfile = { members: ClassroomMember[]; seats: string[]; font: string; seatExchange?: SeatExchange | null };
export type ClassroomAction =
  | { action: 'font'; font: string }
  | { action: 'request-seat-exchange' }
  | { action: 'approve-seat-exchange' | 'decline-seat-exchange' | 'cancel-seat-exchange'; requestId: string };

export function incomingSeatRequests(profile: ClassroomProfile, identityId: string) {
  return profile.seatExchange?.recipientId === identityId ? 1 : 0;
}

// Shared by the persisted store and the two-person local preview.
export function applyClassroomAction(profile: ClassroomProfile, identityId: string, action: ClassroomAction, requestId: string, now: string): ClassroomProfile {
  if (!profile.seats.includes(identityId)) throw new Error('仅座位成员可以修改设置');
  if (action.action === 'font') {
    if (!['sans', 'rounded', 'resource-rounded'].includes(action.font)) throw new Error('字体选项无效');
    return { ...profile, font: action.font };
  }
  if (action.action === 'request-seat-exchange') {
    if (profile.seats.length !== 2 || new Set(profile.seats).size !== 2) throw new Error('等待另一位成员加入');
    if (profile.seatExchange) throw new Error('已有待处理的交换申请');
    return { ...profile, seatExchange: { id: requestId, requesterId: identityId, recipientId: profile.seats.find(id => id !== identityId)!, seats: [...profile.seats], createdAt: now } };
  }
  const pending = profile.seatExchange;
  if (!pending || pending.id !== action.requestId) throw new Error('这条申请已处理，请刷新后重试');
  if (action.action === 'cancel-seat-exchange') {
    if (pending.requesterId !== identityId) throw new Error('只能撤回自己的申请');
    return { ...profile, seatExchange: null };
  }
  if (pending.recipientId !== identityId) throw new Error('只有收到申请的成员可以处理');
  if (action.action === 'decline-seat-exchange') return { ...profile, seatExchange: null };
  if (action.action !== 'approve-seat-exchange') throw new Error('设置操作无效');
  if (pending.seats.length !== profile.seats.length || pending.seats.some((id, index) => id !== profile.seats[index])) throw new Error('座位已变化，请重新申请');
  return { ...profile, seats: [...profile.seats].reverse(), seatExchange: null };
}
export function memberDevices(identityId: string, peers: string[], identities: Record<string, string>) {
  return [...new Set(peers)].filter(peer => identities[peer] === identityId);
}
export function fixedClassroomSeats(profile: ClassroomProfile) {
  return [0, 1].map(index => profile.members.find(member => member.id === profile.seats[index]) || { id: '', name: '同桌', activity: '' });
}
