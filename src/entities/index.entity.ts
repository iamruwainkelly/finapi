import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Stock } from './stock.entity';

@Entity()
export class Index {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  symbol: string;

  // investingSymbol
  @Column({ nullable: true })
  investingSymbol: string;

  @Column({ nullable: true })
  investingUrlName: string;

  @OneToMany(() => Stock, (stock) => stock.index)
  stocks: Stock[];

  @CreateDateColumn({ default: () => Date.now() })
  created: number;

  @UpdateDateColumn({ default: () => Date.now() })
  updated: number;
}
