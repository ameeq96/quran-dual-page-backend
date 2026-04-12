import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { HealthModule } from './health/health.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EditionsModule } from './editions/editions.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { SettingsModule } from './settings/settings.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AssetPacksModule } from './asset_packs/asset_packs.module';
import { ContentDatasetsModule } from './content_datasets/content_datasets.module';
import { MemoryCacheModule } from './common/cache/memory-cache.module';
import { PublicModule } from './public/public.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MemoryCacheModule,
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'storage'),
      serveRoot: '/assets',
    }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      autoLoadEntities: true,
      synchronize: process.env.DB_SYNCHRONIZE !== 'false',
      logging: process.env.DB_LOGGING === 'true',
    }),
    HealthModule,
    AdminModule,
    AuthModule,
    UsersModule,
    EditionsModule,
    AnnouncementsModule,
    SettingsModule,
    AnalyticsModule,
    AssetPacksModule,
    ContentDatasetsModule,
    PublicModule,
  ],
})
export class AppModule {}
