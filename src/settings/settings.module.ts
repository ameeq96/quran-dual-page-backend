import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { AppSetting } from '../entities/app_setting.entity';
import { FeatureFlag } from '../entities/feature_flag.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AppSetting, FeatureFlag])],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
