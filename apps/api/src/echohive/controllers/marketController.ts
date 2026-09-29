import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '@config/prisma';
import { AuthedRequest } from '@middleware/auth';

const uploadUrlSchema = z.string().regex(/^\/uploads\/[a-f0-9-]+(?:\.[a-z0-9]+)?$/i);

const businessProfileSchema = z.object({
  businessName: z.string().trim().min(2).max(80),
  businessAbout: z.string().trim().max(500),
});

const createListingSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(5).max(2000),
  price: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  imageUrl: uploadUrlSchema.optional(),
  modelUrl: uploadUrlSchema.optional(),
});

const listingSelect = {
  id: true,
  title: true,
  description: true,
  price: true,
  currency: true,
  imageUrl: true,
  modelUrl: true,
  createdAt: true,
  seller: {
    select: { id: true, username: true, avatarUrl: true, businessName: true, businessAbout: true },
  },
} satisfies Prisma.ListingSelect;

export async function listListings(req: AuthedRequest, res: Response) {
  const search = String(req.query.search || '').trim();
  const listings = await prisma.listing.findMany({
    where: {
      isActive: true,
      ...(search.length >= 2 && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { seller: { businessName: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: listingSelect,
  });

  res.set('Cache-Control', 'no-store');
  return res.json({ listings });
}

export async function createBusinessProfile(req: AuthedRequest, res: Response) {
  const parsed = businessProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = await prisma.user.update({
    where: { id: req.userId as string },
    data: parsed.data,
    select: { id: true, username: true, businessName: true, businessAbout: true },
  });
  return res.json({ user });
}

export async function createListing(req: AuthedRequest, res: Response) {
  const parsed = createListingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const sellerId = req.userId as string;
  const seller = await prisma.user.findUnique({ where: { id: sellerId }, select: { businessName: true } });
  if (!seller?.businessName) return res.status(409).json({ error: 'Set up your business profile before publishing a listing' });

  const listing = await prisma.listing.create({
    data: {
      ...parsed.data,
      price: new Prisma.Decimal(parsed.data.price),
      sellerId,
    },
    select: listingSelect,
  });
  return res.status(201).json({ listing });
}

export async function deleteListing(req: AuthedRequest, res: Response) {
  const result = await prisma.listing.deleteMany({
    where: { id: req.params.listingId, sellerId: req.userId as string },
  });
  if (!result.count) return res.status(404).json({ error: 'Listing not found' });
  return res.status(204).end();
}