import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EditionsController } from './editions.controller';
import { EditionsService } from './editions.service';
import { Edition } from '../entities/edition.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Edition])],
  controllers: [EditionsController],
  providers: [EditionsService],
})
export class EditionsModule {}
