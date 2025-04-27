import { Controller, Get, Param } from '@nestjs/common';
import { AppService } from './app.service';
import yahooFinance from 'yahoo-finance2';

@Controller('api/')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/')
  get(): string {
    return this.appService.getHello();
  }

  @Get('quote/:symbol')
  async quote(@Param() params: any): Promise<object> {
    console.log('symbol', params.symbol);

    const results = await yahooFinance.quote(params.symbol);
    return results;
  }

  @Get('search/:symbol')
  async search(@Param() params: any): Promise<object> {
    console.log('symbol', params.symbol);

    const results = await yahooFinance.search(params.symbol);
    return results;
  }
}
