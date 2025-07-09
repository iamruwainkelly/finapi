import { Entity, Column, PrimaryGeneratedColumn, BeforeInsert } from 'typeorm';

@Entity()
export class Quote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  symbol: string;

  // store json
  @Column({ type: 'json', nullable: true })
  json: any;

  // regularMarketPrice
  @Column({ type: 'decimal', nullable: true })
  regularMarketPrice: number | undefined;

  // regularMarketChange
  @Column({ type: 'decimal', nullable: true })
  regularMarketChange: number | undefined;

  // regularMarketChangePercent
  @Column({ type: 'decimal', nullable: true })
  regularMarketChangePercent: number | undefined;

  // regularMarketTime
  @Column({ type: 'bigint', nullable: true })
  regularMarketTime: number | undefined;

  // currency
  @Column({ type: 'varchar', nullable: true })
  currency: string | undefined;

  // fiftyTwoWeekLow
  @Column({ type: 'decimal', nullable: true })
  fiftyTwoWeekLow: number | undefined;

  // fiftyTwoWeekHigh
  @Column({ type: 'decimal', nullable: true })
  fiftyTwoWeekHigh: number | undefined;

  // regularMarketDayLow
  @Column({ type: 'decimal', nullable: true })
  regularMarketDayLow: number | undefined;

  // regularMarketDayHigh
  @Column({ type: 'decimal', nullable: true })
  regularMarketDayHigh: number | undefined;

  // exchange
  @Column({ type: 'varchar', nullable: true })
  exchange: string | undefined;

  // market
  @Column({ type: 'varchar', nullable: true })
  market: string | undefined;

  // shortName
  @Column({ type: 'varchar', nullable: true })
  shortName: string | undefined;

  // longName
  @Column({ type: 'varchar', nullable: true })
  longName: string | undefined;

  // marketCap
  @Column({ type: 'bigint', nullable: true })
  marketCap: number | undefined;

  @Column({ nullable: true })
  created: number;

  // store the string date in ISO format
  @Column({ nullable: true })
  createdString: string;

  // upatedAt is automatically managed by TypeORM
  @Column({ nullable: true })
  updated: number;

  @Column({ nullable: true })
  updatedString: string;
}
