import { randomBytes } from 'node:crypto';
export type Member = { id: string; name: string; host: boolean; camera: boolean; mic: boolean; sharing: boolean; source: string };
export type Message = { id: string; name: string; text: string; at: number; sender: string };
export type Room = { id: string; hostKey: string; members: Map<string, Member>; messages: Message[]; touched: number };
export const secret = () => randomBytes(24).toString('base64url');
export function cleanName(value: unknown) { return typeof value === 'string' ? value.trim().slice(0, 32) || 'Guest' : 'Guest'; }
export function cleanText(value: unknown) { return typeof value === 'string' ? value.trim().slice(0, 2000) : ''; }
export function canJoin(room: Room, hostKey?: string) {
  if (room.members.size >= 2) return 'This room already has two people.';
  if (hostKey === room.hostKey && [...room.members.values()].some(m => m.host)) return 'The host is already connected in another tab.';
  if (hostKey !== room.hostKey && [...room.members.values()].some(m => !m.host)) return 'The guest seat is already taken.';
  return null;
}
