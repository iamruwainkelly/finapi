import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    CacheModule.register({
      // milliseconds = seconds * 1000
      // 60 seconds = 1 minute
      // 5 minutes = 5 * 60 seconds = 5 * 1000 milliseconds
      ttl: 60 * 15 * 1000,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
