import { DatabaseModel } from 'src/models/database.model';
import { MarketMoverModel } from 'src/models/marketMover.model';
import { Entity, Column } from 'typeorm';

@Entity()
export class MarketMover extends DatabaseModel implements MarketMoverModel {
  @Column({ unique: true })
  symbol: string;

  @Column()
  index: string;

  @Column()
  json: string;

  @Column()
  name: string;

  @Column()
  price: string;

  @Column()
  priceChange: string;

  @Column()
  percentChange: string;
}
