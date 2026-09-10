export type ClassroomMember = { id: string; name: string; activity: string };
export type ClassroomProfile = { members: ClassroomMember[]; seats: string[]; font: string };
export function memberDevices(identityId: string, peers: string[], identities: Record<string, string>) {
  return [...new Set(peers)].filter(peer => identities[peer] === identityId);
}
export function fixedClassroomSeats(profile: ClassroomProfile) {
  return [0, 1].map(index => profile.members.find(member => member.id === profile.seats[index]) || { id: '', name: '同桌', activity: '' });
}
