import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../common/auth/jwt.guard';
import { ensureStorageDirectory } from '../common/storage-paths';
import { ContentDatasetsService } from './content_datasets.service';

@Controller('content-datasets')
@UseGuards(JwtAuthGuard)
export class ContentDatasetsController {
  constructor(private readonly service: ContentDatasetsService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.list(page, pageSize);
  }

  @Get('active')
  active() {
    return this.service.activeDatasets();
  }

  @Post(':key/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: ensureStorageDirectory('tmp'),
        filename: (
          _: Express.Request,
          file: Express.Multer.File,
          cb: (error: Error | null, filename: string) => void,
        ) => {
          const timestamp = Date.now();
          const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
          cb(null, `${timestamp}-${safe}`);
        },
      }),
    }),
  )
  upload(
    @Param('key') key: string,
    @Body() body: { version: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      return { error: 'file missing' };
    }
    if (!body.version) {
      return { error: 'version missing' };
    }
    return this.service.uploadDataset(key, body.version, file.path);
  }

  @Post(':key/activate')
  activate(@Param('key') key: string, @Body() body: { version: string }) {
    return this.service.activateDataset(key, body.version);
  }
}
