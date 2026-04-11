import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PublicController } from './public.controller';
import { Announcement } from '../entities/announcement.entity';
import { AppSetting } from '../entities/app_setting.entity';
import { ContentDataset } from '../entities/content_dataset.entity';
import { Edition } from '../entities/edition.entity';
import { FeatureFlag } from '../entities/feature_flag.entity';
import { AssetPacksModule } from '../asset_packs/asset_packs.module';
import { PublicAiService } from './public_ai.service';

@Module({
  imports: [
    AssetPacksModule,
    TypeOrmModule.forFeature([
      ContentDataset,
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
