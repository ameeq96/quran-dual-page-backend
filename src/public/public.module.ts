import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PublicController } from './public.controller';
import { Announcement } from '../entities/announcement.entity';
import { AppSetting } from '../entities/app_setting.entity';
import { Edition } from '../entities/edition.entity';
import { FeatureFlag } from '../entities/feature_flag.entity';
import { AssetPacksModule } from '../asset_packs/asset_packs.module';
import { ContentDatasetsModule } from '../content_datasets/content_datasets.module';
import { PublicAiService } from './public_ai.service';

@Module({
  imports: [
    AssetPacksModule,
    ContentDatasetsModule,
    TypeOrmModule.forFeature([
      Announcement,
      AppSetting,
      Edition,
      FeatureFlag,
    ]),
  ],
  controllers: [PublicController],
  providers: [PublicAiService],
})
export class PublicModule {}
