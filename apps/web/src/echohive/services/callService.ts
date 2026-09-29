import api from '@services/api';

export async function getCallIceServers(): Promise<RTCIceServer[]> {
  const { data } = await api.get<{ iceServers: RTCIceServer[] }>('/calls/ice-servers');
  return data.iceServers;
}
