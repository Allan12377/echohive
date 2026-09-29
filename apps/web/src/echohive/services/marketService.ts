import api from '@services/api';
import { MarketListing, Profile } from '@app-types/index';

export interface ListingDraft {
  title: string;
  description: string;
  price: string;
  currency: string;
  imageUrl?: string;
  modelUrl?: string;
}

export async function getListings(search = ''): Promise<MarketListing[]> {
  const { data } = await api.get<{ listings: MarketListing[] }>('/market/listings', {
    params: search ? { search } : undefined,
    headers: { 'Cache-Control': 'no-cache' },
  });
  return data.listings;
}

export async function saveBusinessProfile(values: Pick<Profile, 'businessName' | 'businessAbout'>): Promise<Profile> {
  const { data } = await api.put<{ user: Profile }>('/market/business-profile', values);
  return data.user;
}

export async function publishListing(values: ListingDraft): Promise<MarketListing> {
  const { data } = await api.post<{ listing: MarketListing }>('/market/listings', values);
  return data.listing;
}