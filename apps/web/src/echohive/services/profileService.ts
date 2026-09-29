import api from '@services/api';
import { Profile } from '@app-types/index';

export async function getMyProfile(): Promise<Profile> {
  const { data } = await api.get<{ user: Profile }>('/profile/me');
  return data.user;
}

export async function updateMyProfile(values: Pick<Profile, 'username' | 'about'>): Promise<Profile> {
  const { data } = await api.patch<{ user: Profile }>('/profile/me', values);
  return data.user;
}

export async function uploadProfileAvatar(file: File): Promise<Profile> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.put<{ user: Profile }>('/profile/me/avatar', form);
  return data.user;
}