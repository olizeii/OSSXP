/**
 * Echtzeit-Benachrichtigungen an einzelne User (über die bestehende Socket.IO-Verbindung).
 * Jeder eingeloggte Socket tritt dem Raum `user:<id>` bei (siehe chat/socket.js) –
 * so erreichen Coins/XP/Abzeichen alle offenen Tabs des Users gleichzeitig.
 */

let io = null;

export const setIO = (server) => {
  io = server;
};

export const userRoom = (userId) => `user:${userId}`;

export function emitToUser(userId, event, payload) {
  io?.to(userRoom(userId)).emit(event, payload);
}
