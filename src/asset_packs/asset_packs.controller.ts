import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import { JwtAuthGuard } from '../common/auth/jwt.guard';
import { ensureStorageDirectory } from '../common/storage-paths';
import { AssetPacksService } from './asset_packs.service';

@Controller('asset-packs')
@UseGuards(JwtAuthGuard)
export class AssetPacksController {
  constructor(private readonly service: AssetPacksService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.list(page, pageSize);
  }

  @Get('active')
  active() {
    return this.service.activePacks();
  }

  @Post('import/mobile-assets')
  importMobileAssets(
    @Body()
    body: { sourcePath: string; version: string; editions?: string[] },
  ) {
    return this.service.importFromMobileAssets(
      body.sourcePath,
      body.version,
      body.editions,
    );
  }

  @Post(':edition/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: ensureStorageDirectory('tmp'),
        filename: (_: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
          const timestamp = Date.now();
          const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
          cb(null, `${timestamp}-${safe}`);
        },
      }),
    }),
  )
  upload(
    @Param('edition') edition: string,
    @Body() body: { version: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      return { error: 'file missing' };
    }
    if (!body.version) {
      return { error: 'version missing' };
    }
    return this.service.uploadPack(edition, body.version, file.path);
  }

  @Post(':edition/activate')
  activate(@Param('edition') edition: string, @Body() body: { version: string }) {
    return this.service.activatePack(edition, body.version);
  }

  @Get(':edition/:version/pages')
  pages(
    @Param('edition') edition: string,
    @Param('version') version: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listPackPages(edition, version, page, pageSize);
  }

  @Post(':edition/pages/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: ensureStorageDirectory('tmp'),
        filename: (_: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
          const timestamp = Date.now();
          const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
          cb(null, `${timestamp}-${safe}`);
        },
      }),
    }),
  )
  uploadPage(
    @Param('edition') edition: string,
    @Body() body: { version: string; pageNumber: string | number },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      return { error: 'file missing' };
    }
    if (!body.version) {
      return { error: 'version missing' };
    }
    if (body.pageNumber === undefined || body.pageNumber === null || `${body.pageNumber}`.trim() === '') {
      return { error: 'pageNumber missing' };
    }
    return this.service.uploadPage(
      edition,
      body.version,
      Number(body.pageNumber),
      file.path,
    );
  }

  @Delete(':edition/:version/pages/:pageNumber')
  deletePage(
    @Param('edition') edition: string,
    @Param('version') version: string,
    @Param('pageNumber') pageNumber: string,
  ) {
    return this.service.deletePage(edition, version, Number(pageNumber));
  }

  @Patch(':edition/:version/pages/:pageNumber')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: ensureStorageDirectory('tmp'),
        filename: (_: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
          const timestamp = Date.now();
          const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
          cb(null, `${timestamp}-${safe}`);
        },
      }),
    }),
  )
  updatePage(
    @Param('edition') edition: string,
    @Param('version') version: string,
    @Param('pageNumber') pageNumber: string,
    @Body() body: { nextPageNumber?: string | number },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.updatePage(
      edition,
      version,
      Number(pageNumber),
      body.nextPageNumber === undefined || body.nextPageNumber === null || `${body.nextPageNumber}`.trim() === ''
        ? undefined
        : Number(body.nextPageNumber),
      file?.path,
    );
  }
}
