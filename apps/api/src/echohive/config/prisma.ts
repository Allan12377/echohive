import { PrismaClient } from '@prisma/client';

// Single shared Prisma instance across the app
const prisma = new PrismaClient();

export default prisma;
