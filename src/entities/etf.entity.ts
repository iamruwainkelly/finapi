import {
  Entity,
  Column,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
  Index,
} from 'typeorm';

@Entity()
export class Etf {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  symbol: string;

  @Index()
  @Column()
  name: string;

  @Column()
  currency: string;

  @Column({ type: 'text' })
  summary: string;

  @Column()
  category_group: string;

  @Column()
  category: string;

  @Column()
  family: string;

  @Column()
  exchange: string;
}
