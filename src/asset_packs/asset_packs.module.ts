import { Module } from "@nestjs/common";
import { AssetPacksService } from "./asset_packs.service";

@Module({
  providers: [AssetPacksService],
  exports: [AssetPacksService],
})
export class AssetPacksModule {}
