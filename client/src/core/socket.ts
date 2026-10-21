/**
 * Eine gemeinsame Socket.IO-Verbindung für die ganze Shell.
 * Der Chat nutzt sie für Nachrichten, der economyStore für Live-Updates (Coins, XP, Abzeichen).
 * Bei Login/Logout wird neu verbunden, damit der Server das neue Cookie sieht.
 */
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  socket ??= io({ withCredentials: true });
  return socket;
}

/** Nach Login/Logout neu verbinden (neues Auth-Cookie im Handshake). */
export function reconnectSocket() {
  if (!socket) return;
  socket.disconnect();
  socket.connect();
}
