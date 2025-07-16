// news entity
import { DatabaseModel } from 'src/models/database.model';
import { NewsModel } from 'src/models/news.model';
import { Entity, Column } from 'typeorm';

@Entity()
export class News extends DatabaseModel implements NewsModel {
  @Column()
  symbol: string;

  @Column()
  title: string;

  @Column()
  url: string;

  @Column({ nullable: true })
  imageUrl?: string;

  @Column()
  date: number;

  @Column()
  provider: string;
}
