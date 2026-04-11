import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentDataset } from '../entities/content_dataset.entity';
import { ContentDatasetsController } from './content_datasets.controller';
import { ContentDatasetsService } from './content_datasets.service';

@Module({
  imports: [TypeOrmModule.forFeature([ContentDataset])],
  controllers: [ContentDatasetsController],
  providers: [ContentDatasetsService],
  exports: [ContentDatasetsService],
})
export class ContentDatasetsModule {}
