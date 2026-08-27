import {PrismaClient} from '@prisma/client'; const db=new PrismaClient(); if(process.env.NODE_ENV==='production') throw new Error('Seed disabled in production'); db.$disconnect();
