import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { PublicSyncController } from './public_sync.controller';
import { UsersService } from './users.service';
import { AppUser } from '../entities/app_user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AppUser])],
  controllers: [UsersController, PublicSyncController],
  providers: [UsersService],
})
export class UsersModule {}
