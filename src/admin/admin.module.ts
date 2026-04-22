import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { Announcement } from "../entities/announcement.entity";
import { AppSetting } from "../entities/app_setting.entity";
import { AppUser } from "../entities/app_user.entity";
import { AssetPack } from "../entities/asset_pack.entity";
import { ContentDataset } from "../entities/content_dataset.entity";
import { Edition } from "../entities/edition.entity";
import { FeatureFlag } from "../entities/feature_flag.entity";
import { AssetPacksModule } from "../asset_packs/asset_packs.module";

@Module({
  imports: [
    AssetPacksModule,
    TypeOrmModule.forFeature([
      Announcement,
      AppSetting,
      AppUser,
      AssetPack,
      ContentDataset,
      Edition,
      FeatureFlag,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
