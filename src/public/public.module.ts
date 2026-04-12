import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PublicController } from './public.controller';
import { Announcement } from '../entities/announcement.entity';
import { AppSetting } from '../entities/app_setting.entity';
import { Edition } from '../entities/edition.entity';
import { FeatureFlag } from '../entities/feature_flag.entity';
import { ContentDatasetsModule } from '../content_datasets/content_datasets.module';
import { PublicAiService } from './public_ai.service';
import { PublicSearchService } from './public_search.service';
import { ContentDataset } from '../entities/content_dataset.entity';

@Module({
  imports: [
    ContentDatasetsModule,
    TypeOrmModule.forFeature([
      ContentDataset,
      Announcement,
      AppSetting,
      Edition,
      FeatureFlag,
    ]),
  ],
  controllers: [PublicController],
  providers: [PublicAiService, PublicSearchService],
})
export class PublicModule {}
