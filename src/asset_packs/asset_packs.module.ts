import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetPacksController } from './asset_packs.controller';
import { AssetPacksService } from './asset_packs.service';
import { AssetPack } from '../entities/asset_pack.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AssetPack])],
  controllers: [AssetPacksController],
  providers: [AssetPacksService],
  exports: [AssetPacksService],
})
export class AssetPacksModule {}
