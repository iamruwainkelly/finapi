import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Index } from './entities/index.entity';
import { DataSource, In, Repository } from 'typeorm';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(
    // @InjectRepository(Index)
    private dataSource: DataSource,
  ) {}

  async onModuleInit() {
    // select from index table, where symbols one of the four indexes, ^GSPC, ^SSMI, ^IXIC, ^STOXX50E

    const indexRepository = this.dataSource.getRepository(Index);
    const indices = await indexRepository.find({
      where: {
        symbol: In(['^GSPC', '^SSMI', '^IXIC', '^STOXX50E']),
      },
    });

    // for the indexes not found in the database, create them
    const symbols = ['^GSPC', '^SSMI', '^IXIC', '^STOXX50E'];
    const indicesToCreate = symbols.filter(
      (symbol) => !indices.some((index) => index.symbol === symbol),
    );

    const indicesData = [
      {
        yahooFinanceSymbol: '^GSPC',
        investingSymbol: 'SPX',
        investingUrlName: 'us-spx-500',
      },
      {
        yahooFinanceSymbol: '^IXIC',
        investingSymbol: 'IXIC',
        investingUrlName: 'nasdaq-composite',
      },
      {
        yahooFinanceSymbol: '^STOXX50E',
        investingSymbol: 'STOXX50E',
        investingUrlName: 'eu-stoxx50',
      },
      {
        yahooFinanceSymbol: '^SSMI',
        investingSymbol: 'SMI',
        investingUrlName: 'switzerland-20',
      },
    ];

    const indicesToCreateData = indicesData.filter((data) =>
      indicesToCreate.includes(data.yahooFinanceSymbol),
    );
    const indicesToCreateEntities = indicesToCreateData.map((data) => {
      const index = new Index();
      index.symbol = data.yahooFinanceSymbol;
      index.investingSymbol = data.investingSymbol;
      index.investingUrlName = data.investingUrlName;
      return index;
    });
    await indexRepository.save(indicesToCreateEntities);
    console.log('Index table checked and initialized (if needed).');
  }
}
