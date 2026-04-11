import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header =
      request.headers['x-admin-key'] ||
      request.headers['X-ADMIN-KEY'] ||
      request.headers['x-admin-key'.toLowerCase()];
    const apiKey = Array.isArray(header) ? header[0] : header;

    if (!process.env.ADMIN_API_KEY) {
      throw new UnauthorizedException('ADMIN_API_KEY is not configured');
    }

    if (apiKey !== process.env.ADMIN_API_KEY) {
      throw new UnauthorizedException('Invalid admin key');
    }

    return true;
  }
}
