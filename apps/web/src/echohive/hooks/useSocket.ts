import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket } from '@services/socket';

export function useSocket(token: string | null): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!token) {
      setSocket(null);
      return;
    }

    const s = connectSocket(token);
    setSocket(s);

    return () => {
      disconnectSocket();
      setSocket(null);
    };
  }, [token]);

  return socket;
}
