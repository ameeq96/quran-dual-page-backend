import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { seedAdmin } from './seed/seed-admin';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const port = process.env.PORT ? Number(process.env.PORT) : 5050;
  await seedAdmin(app);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Admin API listening on http://localhost:${port}`);
}

bootstrap();
